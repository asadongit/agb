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
from sqlalchemy.orm import selectinload

from app.models.abandoned_cart import AbandonedCart
from app.models.customer import Customer
from app.models.enums import OrderStatusEnum, SessionStatusEnum
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.table_session import TableSession

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
    restaurant_id: uuid.UUID,
    table_number: str,
    normalized_name: str,
) -> str:
    """Build the unique session key."""
    return f"{restaurant_id}:{table_number}:{normalized_name}"


def utc_now() -> datetime:
    """Return naive UTC datetime for DB compatibility across Postgres and SQLite."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _get_restaurant_by_slug(
    db: AsyncSession, slug: str
) -> Restaurant:
    """Look up restaurant by slug or raise 404."""
    result = await db.execute(
        select(Restaurant).where(Restaurant.slug == slug)
    )
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Outlet '{slug}' not found",
        )
    return restaurant


async def start_or_resume_session(
    db: AsyncSession,
    restaurant_slug: str,
    table_number: str,
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
      - session: TableSession
      - is_returning: bool (phone matched existing customer)
      - active_orders: list[Order]
      - session_duration_minutes: int
    """
    restaurant = await _get_restaurant_by_slug(db, restaurant_slug)
    duration_minutes = restaurant.session_duration_minutes

    norm_name = normalize_name(customer_name)
    session_key = build_session_key(restaurant.id, table_number, norm_name)
    now = utc_now()

    # Expire stale sessions first
    await _expire_stale_sessions(db, restaurant.id, table_number, now)

    # Check for ANY active session on this basket (basket locking)
    result = await db.execute(
        select(TableSession)
        .where(
            TableSession.restaurant_id == restaurant.id,
            TableSession.table_number == table_number,
            TableSession.status == SessionStatusEnum.ACTIVE,
        )
        .options(selectinload(TableSession.orders).selectinload(Order.items))
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
                    db, restaurant.id, customer_name, customer_phone, existing
                )

            return {
                "session": existing,
                "is_returning": is_returning,
                "active_orders": list(existing.orders),
                "session_duration_minutes": duration_minutes,
            }
        else:
            # Different name → basket is locked
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"This basket is currently in use by {existing.customer_name}. "
                    "Please use a different basket or wait until it's available."
                ),
            )

    # No active session on this basket — archive any old session_key to free slot
    result = await db.execute(
        select(TableSession).where(TableSession.session_key == session_key)
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
            db, restaurant.id, customer_name, customer_phone
        )
        customer_id = customer.id

    new_session = TableSession(
        id=uuid.uuid4(),
        restaurant_id=restaurant.id,
        table_number=table_number,
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
) -> tuple[TableSession, int]:
    """Get a session by ID with all its orders loaded.

    Returns (session, session_duration_minutes).
    Auto-expires if past deadline.
    """
    result = await db.execute(
        select(TableSession)
        .where(TableSession.id == session_id)
        .options(selectinload(TableSession.orders).selectinload(Order.items))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Look up duration for response
    rest_result = await db.execute(
        select(Restaurant.session_duration_minutes)
        .where(Restaurant.id == session.restaurant_id)
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
) -> TableSession:
    """Extend an active session by the outlet's configured duration.

    No cap on number of extensions.
    """
    result = await db.execute(
        select(TableSession).where(
            TableSession.id == session_id,
            TableSession.status == SessionStatusEnum.ACTIVE,
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
        select(Restaurant.session_duration_minutes)
        .where(Restaurant.id == session.restaurant_id)
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
        select(TableSession).where(
            TableSession.id == session_id,
            TableSession.status == SessionStatusEnum.ACTIVE,
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
) -> TableSession:
    """Staff manually terminates an active session."""
    result = await db.execute(
        select(TableSession).where(
            TableSession.id == session_id,
            TableSession.status == SessionStatusEnum.ACTIVE,
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
        select(TableSession)
        .where(TableSession.id == session_id)
        .options(selectinload(TableSession.customer))
    )
    session = result.scalar_one_or_none()
    if not session:
        return None

    cart = AbandonedCart(
        id=uuid.uuid4(),
        restaurant_id=session.restaurant_id,
        session_id=session.id,
        table_number=session.table_number,
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
        select(TableSession).where(
            TableSession.id == session_id,
            TableSession.status == SessionStatusEnum.ACTIVE,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return

    # Look up outlet duration
    rest_result = await db.execute(
        select(Restaurant.session_duration_minutes)
        .where(Restaurant.id == session.restaurant_id)
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
        select(TableSession)
        .where(TableSession.id == session_id)
        .options(selectinload(TableSession.orders))
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
    restaurant_slug: str,
    phone: str,
    days: int = 30,
) -> dict:
    """Get past orders for a customer identified by phone number."""
    restaurant = await _get_restaurant_by_slug(db, restaurant_slug)

    # Find customer
    result = await db.execute(
        select(Customer).where(
            Customer.restaurant_id == restaurant.id,
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
        .join(TableSession, Order.session_id == TableSession.id)
        .where(
            TableSession.customer_id == customer.id,
            Order.created_at >= cutoff,
        )
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()

    return {
        "customer_name": customer.name,
        "customer_phone": customer.phone,
        "past_orders": list(orders),
    }


# ── Private helpers ──────────────────────────────────────────────────────


def _archive_session_key(session: TableSession) -> None:
    """Archive session_key to release the unique constraint slot."""
    if ":archived:" not in session.session_key:
        session.session_key = f"{session.session_key}:archived:{session.id}"


async def _upsert_customer(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    name: str,
    phone: str,
) -> tuple[Customer, bool]:
    """Find or create a Customer record. Returns (customer, is_returning)."""
    result = await db.execute(
        select(Customer).where(
            Customer.restaurant_id == restaurant_id,
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
        restaurant_id=restaurant_id,
        name=name.strip(),
        phone=phone.strip(),
    )
    db.add(customer)
    await db.flush()
    return customer, False


async def _link_customer(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    name: str,
    phone: str,
    session: TableSession,
) -> bool:
    """Link a customer to an existing session if phone is provided."""
    customer, is_returning = await _upsert_customer(
        db, restaurant_id, name, phone
    )
    if session.customer_id != customer.id:
        session.customer_id = customer.id
        await db.flush()
    return is_returning


async def _expire_stale_sessions(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    table_number: str,
    now: datetime,
) -> None:
    """Mark expired sessions as EXPIRED and archive session_key."""
    result = await db.execute(
        select(TableSession).where(
            TableSession.restaurant_id == restaurant_id,
            TableSession.table_number == table_number,
            TableSession.status == SessionStatusEnum.ACTIVE,
            TableSession.expires_at < now,
        )
    )
    stale = result.scalars().all()
    for s in stale:
        s.status = SessionStatusEnum.EXPIRED
        _archive_session_key(s)
    if stale:
        await db.flush()
