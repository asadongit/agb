"""
Order service — creation, server-side pricing, state machine enforcement.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import OrderStatusEnum, is_valid_transition
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.restaurant import Restaurant
from app.schemas.order import CheckoutRequest, OrderItemRequest


def evaluate_verification_rules(
    restaurant: Restaurant,
    item_menu_item_ids: list[str | uuid.UUID],
    total_amount: Decimal,
) -> bool:
    """
    Evaluate verification rules for an order.
    Returns True if manual staff verification is required, False if it can auto-skip.

    Rule Precedence:
    1. Flagged item check: A flagged item in cart ALWAYS requires verification.
    2. Amount cutoff check: If amount cutoff is configured and total_amount < cutoff, auto-skip verification.
    3. Default (no rules set, or total >= cutoff): Requires manual verification.
    """
    flagged_set = {str(fid) for fid in (restaurant.flagged_item_ids or [])}
    order_item_ids = {str(mid) for mid in item_menu_item_ids}

    # Rule 1: Flagged item override
    if flagged_set and (flagged_set & order_item_ids):
        return True  # Requires verification!

    # Rule 2: Amount cutoff check
    cutoff = restaurant.verification_amount_cutoff
    if cutoff is not None and total_amount < cutoff:
        return False  # Auto-skip verification!

    # Rule 3: Default
    return True


async def create_order(
    db: AsyncSession,
    data: CheckoutRequest,
) -> Order:
    """
    Create an order with server-side total computation.
    Total is computed from stored MenuItem/MenuItemVariant prices —
    NEVER trust a client-submitted total.
    """
    # Look up restaurant by slug
    result = await db.execute(
        select(Restaurant).where(Restaurant.slug == data.restaurant_slug)
    )
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Restaurant '{data.restaurant_slug}' not found",
        )

    # Build order items with snapshot pricing
    order_items: list[OrderItem] = []
    total = Decimal("0.00")

    for item_req in data.items:
        unit_price = await _compute_unit_price(
            db, restaurant.id, item_req
        )
        order_item = OrderItem(
            id=uuid.uuid4(),
            menu_item_id=item_req.menu_item_id,
            variant_id=item_req.variant_id,
            quantity=item_req.quantity,
            unit_price=unit_price,
        )
        order_items.append(order_item)
        total += unit_price * item_req.quantity

    requires_verification = evaluate_verification_rules(
        restaurant, [item.menu_item_id for item in order_items], total
    )

    order = Order(
        id=uuid.uuid4(),
        restaurant_id=restaurant.id,
        session_id=data.session_id,
        table_number=data.table_number,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        total_amount=total,
        status=OrderStatusEnum.PENDING,
        is_auto_verified=not requires_verification,
        items=order_items,
    )

    db.add(order)
    await db.flush()

    # If linked to a session, refresh its expiry
    if data.session_id:
        from app.services.session_service import refresh_session_expiry
        await refresh_session_expiry(db, data.session_id)

    # Re-load with items relationship
    await db.refresh(order, ["items"])
    return order


async def _compute_unit_price(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    item_req: OrderItemRequest,
) -> Decimal:
    """
    Compute the unit price for an order item from stored prices.
    unit_price = MenuItem.price + MenuItemVariant.price_delta (if variant selected)
    """
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_req.menu_item_id,
            MenuItem.restaurant_id == restaurant_id,
            MenuItem.is_available == True,  # noqa: E712
        )
    )
    menu_item = result.scalar_one_or_none()
    if not menu_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu item {item_req.menu_item_id} not found or unavailable",
        )

    price = menu_item.price

    if item_req.variant_id:
        var_result = await db.execute(
            select(MenuItemVariant).where(
                MenuItemVariant.id == item_req.variant_id,
                MenuItemVariant.menu_item_id == menu_item.id,
                MenuItemVariant.is_available == True,  # noqa: E712
            )
        )
        variant = var_result.scalar_one_or_none()
        if not variant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Variant {item_req.variant_id} not found or unavailable",
            )
        price += variant.price_delta

    return price


async def transition_order_status(
    db: AsyncSession,
    order: Order,
    new_status: OrderStatusEnum,
) -> Order:
    """
    Enforce the state machine — reject invalid transitions with 400.
    See architecture.md Diagram 3 for the valid transition graph.
    """
    if not is_valid_transition(order.status, new_status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid status transition: {order.status.value} → {new_status.value}. "
                f"Allowed transitions from {order.status.value}: "
                f"{[s.value for s in __import__('app.models.enums', fromlist=['VALID_ORDER_TRANSITIONS']).VALID_ORDER_TRANSITIONS.get(order.status, set())]}"
            ),
        )

    old_status = order.status
    order.status = new_status
    await db.flush()

    # Trigger recipe-based inventory auto-deduction when order enters PAID, PREPARING, or COMPLETED
    if new_status in {OrderStatusEnum.PAID, OrderStatusEnum.PREPARING, OrderStatusEnum.COMPLETED} and old_status not in {OrderStatusEnum.PAID, OrderStatusEnum.PREPARING, OrderStatusEnum.COMPLETED}:
        from app.services.inventory_service import process_order_auto_deduction
        await process_order_auto_deduction(db, order)

    # Trigger cancellation reversal if an already deducted order is cancelled or refunded
    if new_status in {OrderStatusEnum.CANCELLED, OrderStatusEnum.REFUNDED} and old_status in {OrderStatusEnum.PAID, OrderStatusEnum.PREPARING, OrderStatusEnum.COMPLETED}:
        from app.services.inventory_service import process_order_cancellation_reversal
        await process_order_cancellation_reversal(db, order)

    # Check if this transition completes the entire session
    if order.session_id:
        from app.services.session_service import check_session_completion
        await check_session_completion(db, order.session_id)

    return await get_order_with_items(db, order.id, order.restaurant_id)


async def get_order_with_items(
    db: AsyncSession,
    order_id: uuid.UUID,
    restaurant_id: uuid.UUID,
) -> Order:
    """Get an order by ID, scoped to a restaurant, with items loaded."""
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id, Order.restaurant_id == restaurant_id)
        .options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    return order


async def purge_old_non_completed_orders(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
) -> int:
    """
    Purge non-completed orders older than 24 hours for a restaurant.
    COMPLETED (Served) orders are NEVER deleted — kept forever for inventory & reporting.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import delete

    cutoff_utc = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)

    subquery = (
        select(Order.id)
        .where(
            Order.restaurant_id == restaurant_id,
            Order.status != OrderStatusEnum.COMPLETED,
            Order.created_at < cutoff_utc,
        )
    )

    result = await db.execute(subquery)
    expired_ids = result.scalars().all()

    if not expired_ids:
        return 0

    await db.execute(
        delete(Order).where(Order.id.in_(expired_ids))
    )
    await db.flush()
    return len(expired_ids)
