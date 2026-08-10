"""
Session service — basket session lifecycle, customer identity, locking,
expiry, extension, abandonment.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models.abandoned_cart import AbandonedCart
from app.models.customer import Customer
from app.models.enums import OrderStatusEnum, SessionStatusEnum
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.outlet import Outlet
from app.models.basket_session import BasketSession
from app.models.staff_audit_log import StaffAuditLog
from app.schemas.session import StaffAddItemsRequest
from app.services.order_service import evaluate_verification_rules
from app.services.websocket_service import manager

# Terminal statuses — session is complete when ALL orders are in one of these
TERMINAL_STATUSES = {
    OrderStatusEnum.COMPLETED,
    OrderStatusEnum.CANCELLED,
    OrderStatusEnum.REFUNDED,
}


def normalize_name(name: str) -> str:
    """Normalize customer name for session key matching.

    'Asad Waqar' → 'asad-waqar'
    """
    return name.strip().lower().replace(" ", "-")


def build_session_key(
    outlet_id: uuid.UUID,
    basket_number: str,
    normalized_name: str,
) -> str:
    """Build the unique session key."""
    return f"{outlet_id}:{basket_number}:{normalized_name}"


def utc_now() -> datetime:
    """Return naive UTC datetime for DB compatibility across Postgres and SQLite."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _get_outlet_by_slug(
    db: AsyncSession, slug: str
) -> Outlet:
    """Look up outlet by slug or raise 404."""
    result = await db.execute(
        select(Outlet).where(Outlet.slug == slug)
    )
    outlet = result.scalar_one_or_none()
    if not outlet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Outlet '{slug}' not found",
        )
    return outlet


async def start_or_resume_session(
    db: AsyncSession,
    outlet_slug: str,
    basket_number: str,
    customer_name: str,
    customer_phone: str | None = None,
) -> dict:
    """
    Start a new session or resume an existing active one.

    Basket locking rules:
    - Same normalized name on same basket → resume existing session
    - Different name on basket with active session → 409 blocked
    - No active session on basket → create new

    Returns dict with:
      - session: BasketSession
      - is_returning: bool (phone matched existing customer)
      - active_orders: list[Order]
      - session_duration_minutes: int
    """
    outlet = await _get_outlet_by_slug(db, outlet_slug)
    duration_minutes = outlet.session_duration_minutes

    norm_name = normalize_name(customer_name)
    session_key = build_session_key(outlet.id, basket_number, norm_name)
    now = utc_now()

    # Expire stale sessions first
    await _expire_stale_sessions(db, outlet.id, basket_number, now)

    # Check for ANY active session on this basket (basket locking)
    result = await db.execute(
        select(BasketSession)
        .where(
            BasketSession.outlet_id == outlet.id,
            BasketSession.basket_number == basket_number,
            BasketSession.status == SessionStatusEnum.ACTIVE,
        )
        .options(
            selectinload(BasketSession.orders).selectinload(Order.items),
            selectinload(BasketSession.orders).joinedload(Order.outlet),
        )
    )
    active_sessions = result.scalars().all()

    for existing in active_sessions:
        if normalize_name(existing.customer_name) == norm_name:
            # Same name → resume session, extend expiry
            existing.expires_at = now + timedelta(minutes=duration_minutes)
            await db.flush()

            is_returning = False
            if customer_phone and customer_phone.strip():
                is_returning = await _link_customer(
                    db, outlet.id, customer_name, customer_phone, existing
                )

            return {
                "session": existing,
                "is_returning": is_returning,
                "active_orders": list(existing.orders),
                "session_duration_minutes": duration_minutes,
            }
        else:
            # Different name → basket is locked (unless it's a public basket)
            if outlet.public_basket_number and basket_number == outlet.public_basket_number:
                # Public basket — allow multiple concurrent sessions, skip conflict
                pass
            else:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"This basket is currently in use by {existing.customer_name}. "
                        "Please use a different basket or wait until it's available."
                    ),
                )

    # No active session on this basket — archive any old session_key to free slot
    result = await db.execute(
        select(BasketSession).where(BasketSession.session_key == session_key)
    )
    old_session = result.scalar_one_or_none()
    if old_session and old_session.status != SessionStatusEnum.ACTIVE:
        old_session.session_key = f"{session_key}:archived:{old_session.id}"
        await db.flush()

    # Create new session
    is_returning = False
    customer_id = None

    if customer_phone and customer_phone.strip():
        customer, is_returning = await _upsert_customer(
            db, outlet.id, customer_name, customer_phone
        )
        customer_id = customer.id

    new_session = BasketSession(
        id=uuid.uuid4(),
        outlet_id=outlet.id,
        basket_number=basket_number,
        session_key=session_key,
        customer_name=customer_name.strip(),
        customer_id=customer_id,
        status=SessionStatusEnum.ACTIVE,
        expires_at=now + timedelta(minutes=duration_minutes),
    )
    db.add(new_session)
    await db.flush()
    await db.refresh(new_session)

    return {
        "session": new_session,
        "is_returning": is_returning,
        "active_orders": [],
        "session_duration_minutes": duration_minutes,
    }


async def get_session_with_orders(
    db: AsyncSession,
    session_id: uuid.UUID,
) -> tuple[BasketSession, int]:
    """Get a session by ID with all its orders loaded.

    Returns (session, session_duration_minutes).
    Auto-expires if past deadline.
    """
    result = await db.execute(
        select(BasketSession)
        .where(BasketSession.id == session_id)
        .options(
            selectinload(BasketSession.orders).selectinload(Order.items),
            selectinload(BasketSession.orders).joinedload(Order.outlet),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Look up duration for response
    rest_result = await db.execute(
        select(Outlet.session_duration_minutes)
        .where(Outlet.id == session.outlet_id)
    )
    duration_minutes = rest_result.scalar_one_or_none() or 30

    now = utc_now()
    # Auto-expire if past deadline
    if session.status == SessionStatusEnum.ACTIVE and session.expires_at < now:
        session.status = SessionStatusEnum.EXPIRED
        _archive_session_key(session)
        await db.flush()

    return session, duration_minutes


async def extend_session(
    db: AsyncSession,
    session_id: uuid.UUID,
) -> BasketSession:
    """Extend an active session by the outlet's configured duration.

    No cap on number of extensions.
    """
    result = await db.execute(
        select(BasketSession).where(
            BasketSession.id == session_id,
            BasketSession.status == SessionStatusEnum.ACTIVE,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active session not found",
        )

    # Look up outlet duration
    rest_result = await db.execute(
        select(Outlet.session_duration_minutes)
        .where(Outlet.id == session.outlet_id)
    )
    duration_minutes = rest_result.scalar_one_or_none() or 30

    session.expires_at = utc_now() + timedelta(minutes=duration_minutes)
    await db.flush()
    return session


async def expire_session(
    db: AsyncSession,
    session_id: uuid.UUID,
) -> None:
    """Mark a session as expired and release the basket lock."""
    result = await db.execute(
        select(BasketSession).where(
            BasketSession.id == session_id,
            BasketSession.status == SessionStatusEnum.ACTIVE,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return  # Already expired/completed

    session.status = SessionStatusEnum.EXPIRED
    _archive_session_key(session)
    await db.flush()


async def terminate_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    terminated_by_id: uuid.UUID,
    reason: str | None = None,
) -> BasketSession:
    """Staff manually terminates an active session."""
    result = await db.execute(
        select(BasketSession).where(
            BasketSession.id == session_id,
            BasketSession.status == SessionStatusEnum.ACTIVE,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active session not found",
        )

    session.status = SessionStatusEnum.TERMINATED
    session.terminated_by_id = terminated_by_id
    session.terminated_reason = reason
    _archive_session_key(session)
    await db.flush()
    return session


async def save_abandoned_cart(
    db: AsyncSession,
    session_id: uuid.UUID,
    items: list[dict[str, Any]],
    total_estimate: Decimal,
) -> AbandonedCart | None:
    """Store a cart snapshot pushed by the frontend on session expiry.

    Returns the created AbandonedCart, or None if items list is empty.
    """
    if not items:
        return None

    result = await db.execute(
        select(BasketSession)
        .where(BasketSession.id == session_id)
        .options(selectinload(BasketSession.customer))
    )
    session = result.scalar_one_or_none()
    if not session:
        return None

    cart = AbandonedCart(
        id=uuid.uuid4(),
        outlet_id=session.outlet_id,
        session_id=session.id,
        basket_number=session.basket_number,
        customer_name=session.customer_name,
        customer_phone=session.customer.phone if session.customer_id else None,
        items=items,
        total_estimate=total_estimate,
        status="ABANDONED",
    )
    db.add(cart)
    await db.flush()
    return cart


async def refresh_session_expiry(
    db: AsyncSession,
    session_id: uuid.UUID,
) -> None:
    """Refresh session expiry after a new order is placed."""
    result = await db.execute(
        select(BasketSession).where(
            BasketSession.id == session_id,
            BasketSession.status == SessionStatusEnum.ACTIVE,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return

    # Look up outlet duration
    rest_result = await db.execute(
        select(Outlet.session_duration_minutes)
        .where(Outlet.id == session.outlet_id)
    )
    duration_minutes = rest_result.scalar_one_or_none() or 30

    session.expires_at = utc_now() + timedelta(minutes=duration_minutes)
    await db.flush()


async def check_session_completion(
    db: AsyncSession,
    session_id: uuid.UUID,
) -> None:
    """
    Check if all orders in a session have reached a terminal state.
    If so, mark the session as completed.
    """
    result = await db.execute(
        select(BasketSession)
        .where(BasketSession.id == session_id)
        .options(selectinload(BasketSession.orders))
    )
    session = result.scalar_one_or_none()
    if not session or session.status != SessionStatusEnum.ACTIVE:
        return

    if not session.orders:
        return  # No orders yet, keep active

    all_terminal = all(o.status in TERMINAL_STATUSES for o in session.orders)
    if all_terminal:
        session.status = SessionStatusEnum.COMPLETED
        _archive_session_key(session)
        await db.flush()


async def get_customer_history(
    db: AsyncSession,
    outlet_slug: str,
    phone: str,
    days: int = 30,
) -> dict:
    """Get past orders for a customer identified by phone number."""
    outlet = await _get_outlet_by_slug(db, outlet_slug)

    # Find customer
    result = await db.execute(
        select(Customer).where(
            Customer.outlet_id == outlet.id,
            Customer.phone == phone.strip(),
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        return {
            "customer_name": "",
            "customer_phone": phone.strip(),
            "past_orders": [],
        }

    # Get orders from sessions linked to this customer
    cutoff = utc_now() - timedelta(days=days)
    result = await db.execute(
        select(Order)
        .join(BasketSession, Order.session_id == BasketSession.id)
        .where(
            BasketSession.customer_id == customer.id,
            Order.created_at >= cutoff,
        )
        .options(selectinload(Order.items), joinedload(Order.outlet))
        .order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()

    return {
        "customer_name": customer.name,
        "customer_phone": customer.phone,
        "past_orders": list(orders),
    }


# ── Private helpers ──────────────────────────────────────────────────────


def _archive_session_key(session: BasketSession) -> None:
    """Archive session_key to release the unique constraint slot."""
    if ":archived:" not in session.session_key:
        session.session_key = f"{session.session_key}:archived:{session.id}"


async def _upsert_customer(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    name: str,
    phone: str,
) -> tuple[Customer, bool]:
    """Find or create a Customer record. Returns (customer, is_returning)."""
    result = await db.execute(
        select(Customer).where(
            Customer.outlet_id == outlet_id,
            Customer.phone == phone.strip(),
        )
    )
    customer = result.scalar_one_or_none()

    if customer:
        # Update name to latest
        customer.name = name.strip()
        await db.flush()
        return customer, True

    customer = Customer(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name=name.strip(),
        phone=phone.strip(),
    )
    db.add(customer)
    await db.flush()
    return customer, False


async def _link_customer(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    name: str,
    phone: str,
    session: BasketSession,
) -> bool:
    """Link a customer to an existing session if phone is provided."""
    customer, is_returning = await _upsert_customer(
        db, outlet_id, name, phone
    )
    if session.customer_id != customer.id:
        session.customer_id = customer.id
        await db.flush()
    return is_returning


async def _expire_stale_sessions(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    basket_number: str,
    now: datetime,
) -> None:
    """Mark expired sessions as EXPIRED and archive session_key."""
    result = await db.execute(
        select(BasketSession).where(
            BasketSession.outlet_id == outlet_id,
            BasketSession.basket_number == basket_number,
            BasketSession.status == SessionStatusEnum.ACTIVE,
            BasketSession.expires_at < now,
        )
    )
    stale = result.scalars().all()
    for s in stale:
        s.status = SessionStatusEnum.EXPIRED
        _archive_session_key(s)
    if stale:
        await db.flush()


async def staff_add_items_to_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    outlet_id: uuid.UUID,
    staff_user: Any,
    data: StaffAddItemsRequest,
) -> Order:
    """Staff adds items directly to an active customer basket session."""
    session = await db.get(BasketSession, session_id)
    if not session or session.outlet_id != outlet_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active basket session not found.",
        )

    if session.status != SessionStatusEnum.ACTIVE or session.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is no longer active.",
        )

    staff_id = getattr(staff_user, "user_id", None) or getattr(staff_user, "id", None)

    order = Order(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        session_id=session.id,
        basket_number=session.basket_number,
        customer_name=session.customer_name,
        customer_phone=session.customer.phone if session.customer else None,
        status=OrderStatusEnum.PAYMENT_PENDING,
        payment_reference=None,
        source="staff_assisted",
        is_auto_verified=True,
        created_by_staff_id=staff_id,
        subtotal_amount=Decimal("0.00"),
        total_amount=Decimal("0.00"),
    )
    db.add(order)
    await db.flush()

    subtotal = Decimal("0.00")
    has_flagged_item = False
    added_items_meta = []

    for item_in in data.items:
        m_uuid = uuid.UUID(str(item_in.menu_item_id)) if item_in.menu_item_id else None
        menu_item = await db.get(MenuItem, m_uuid) if m_uuid else None
        if not menu_item or menu_item.outlet_id != outlet_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Menu item {item_in.menu_item_id} not found.",
            )

        if menu_item.is_verification_required:
            has_flagged_item = True

        price = Decimal(str(menu_item.price))
        item_name = menu_item.name
        v_uuid = uuid.UUID(str(item_in.variant_id)) if item_in.variant_id else None
        if v_uuid:
            variant = await db.get(MenuItemVariant, v_uuid)
            if variant and variant.menu_item_id == menu_item.id:
                price += Decimal(str(variant.price_delta))
                item_name = f"{item_name} ({variant.name})"

        line_total = price * Decimal(str(item_in.quantity))
        subtotal += line_total

        order_item = OrderItem(
            id=uuid.uuid4(),
            order_id=order.id,
            menu_item_id=menu_item.id,
            variant_id=v_uuid,
            added_by_staff_id=staff_id,
            quantity=item_in.quantity,
            unit_price=price,
            item_name=item_name,
            line_total=line_total,
        )
        db.add(order_item)
        added_items_meta.append({
            "menu_item_id": str(menu_item.id),
            "name": item_name,
            "quantity": float(item_in.quantity),
            "unit_price": float(price),
            "line_total": float(line_total),
        })

    order.subtotal_amount = subtotal
    order.total_amount = subtotal

    # Anti-theft rule evaluation
    res_rest = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
    outlet = res_rest.scalar_one_or_none()
    if outlet:
        requires_verification = evaluate_verification_rules(outlet, has_flagged_item, subtotal)
        order.is_auto_verified = not requires_verification
        if requires_verification:
            order.status = OrderStatusEnum.PENDING_VERIFICATION

    # Record staff audit log
    audit_entry = StaffAuditLog(
        id=uuid.uuid4(),
        staff_id=staff_id,
        outlet_id=outlet_id,
        action_type="STAFF_ASSIST_BASKET_ADD",
        reference_type="session",
        reference_id=str(session.id),
        details=f"Staff added {len(added_items_meta)} item(s) to Basket #{session.basket_number} ({session.customer_name}). Total: ₹{subtotal:.2f}",
    )
    db.add(audit_entry)

    await db.commit()
    await db.refresh(order)

    # Broadcast WebSocket notification
    await manager.broadcast_to_outlet(
        outlet_id=outlet_id,
        event_type="new_order",
        data={
            "order_id": str(order.id),
            "session_id": str(session.id),
            "basket_number": session.basket_number,
            "customer_name": session.customer_name,
            "source": "staff_assisted",
            "status": order.status.value,
            "total_amount": float(order.total_amount),
            "created_by_staff_id": str(staff_id) if staff_id else None,
        },
    )

    return order
