"""
Order admin routes — list orders, update status, cancel, refund, confirm payment.
All tenant-scoped via JWT outlet_id.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from app.dependencies import (
    DBSession,
    RequireAdmin,
    RequireStaffOrAdmin,
    outlet_scoped_query,
)
from app.models.enums import OrderStatusEnum, PaymentModeEnum, is_valid_transition
from app.models.order import Order
from app.models.outlet import Outlet
from app.schemas.common import MessageResponse
from app.schemas.order import (
    ConfirmPaymentRequest,
    OrderResponse,
    OrderStatusUpdate,
)
from app.config import get_settings
from app.core.shift_utils import get_current_shift_window_utc
from app.services.audit_service import log_action
from app.services.order_service import (
    purge_old_non_completed_orders,
    transition_order_status,
)
from app.services.payment_service import create_razorpay_refund
from app.services.websocket_service import (
    broadcast_order_status_changed,
)

router = APIRouter(prefix="/api/admin/orders", tags=["admin-orders"])


@router.get("", response_model=list[OrderResponse])
async def list_orders(
    current_user: RequireStaffOrAdmin,
    db: DBSession,
    status_filter: OrderStatusEnum | None = None,
    all_history: bool = False,
):
    """
    List kitchen dashboard orders for the current business shift (GMT+5:30).
    - Auto-purges non-completed orders older than 24 hours (COMPLETED orders preserved forever).
    - Filters by the DASHBOARD_RESET_TIME business day window.
    """
    # 1. Purge non-completed orders older than 24 hours
    await purge_old_non_completed_orders(db, current_user.outlet_id)

    # 2. Build base query
    stmt = select(Order).options(selectinload(Order.items), joinedload(Order.outlet))
    stmt = outlet_scoped_query(stmt, Order, current_user.outlet_id)

    if status_filter:
        stmt = stmt.where(Order.status == status_filter)

    # 3. Apply IST shift window filter unless all_history is requested
    if not all_history:
        settings = get_settings()
        shift_start_utc, shift_end_utc = get_current_shift_window_utc(
            settings.DASHBOARD_RESET_TIME
        )
        stmt = stmt.where(
            Order.created_at >= shift_start_utc,
            Order.created_at <= shift_end_utc,
        )

    stmt = stmt.order_by(Order.created_at.desc())

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: uuid.UUID,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """Get a single order (tenant-scoped)."""
    stmt = (
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items), joinedload(Order.outlet))
    )
    stmt = outlet_scoped_query(stmt, Order, current_user.outlet_id)
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    return order


@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: uuid.UUID,
    data: OrderStatusUpdate,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """
    Update order status — enforces the state machine.
    Rejects invalid transitions with 400.
    """
    stmt = (
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items), joinedload(Order.outlet))
    )
    stmt = outlet_scoped_query(stmt, Order, current_user.outlet_id)
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    old_status = order.status.value
    order = await transition_order_status(db, order, data.status)

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "UPDATE_STATUS", "Order", str(order.id),
        details={"old_status": old_status, "new_status": order.status.value},
    )

    # Broadcast status change to dashboard
    await broadcast_order_status_changed(
        current_user.outlet_id, order.id, old_status, order.status.value
    )

    return order


@router.post("/{order_id}/confirm-payment", response_model=OrderResponse)
async def confirm_payment(
    order_id: uuid.UUID,
    data: ConfirmPaymentRequest,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """
    Staff confirms payment (Mode B — Direct UPI).
    Transitions PENDING_VERIFICATION → PAID.
    """
    stmt = (
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items), joinedload(Order.outlet))
    )
    stmt = outlet_scoped_query(stmt, Order, current_user.outlet_id)
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    old_status = order.status.value
    order = await transition_order_status(db, order, OrderStatusEnum.PAID)

    if data.payment_reference:
        order.payment_reference = data.payment_reference
        await db.flush()

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "CONFIRM_PAYMENT", "Order", str(order.id),
        details={"payment_reference": data.payment_reference},
    )

    await broadcast_order_status_changed(
        current_user.outlet_id, order.id, old_status, OrderStatusEnum.PAID.value
    )

    return order


@router.post("/{order_id}/cancel", response_model=OrderResponse)
async def cancel_order(
    order_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """
    Cancel an order — allowed only from PENDING or PENDING_VERIFICATION.
    """
    stmt = (
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items), joinedload(Order.outlet))
    )
    stmt = outlet_scoped_query(stmt, Order, current_user.outlet_id)
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    old_status = order.status.value
    order = await transition_order_status(db, order, OrderStatusEnum.CANCELLED)

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "CANCEL", "Order", str(order.id),
    )

    await broadcast_order_status_changed(
        current_user.outlet_id, order.id, old_status, OrderStatusEnum.CANCELLED.value
    )

    return order


@router.post("/{order_id}/refund", response_model=OrderResponse)
async def refund_order(
    order_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """
    Refund an order — allowed only from PAID.
    Mode A: calls Razorpay refund API.
    Mode B: administrative record only (no automated money movement).
    """
    stmt = (
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items), joinedload(Order.outlet))
    )
    stmt = outlet_scoped_query(stmt, Order, current_user.outlet_id)
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    # Get outlet to check payment mode
    outlet_result = await db.execute(
        select(Outlet).where(Outlet.id == current_user.outlet_id)
    )
    outlet = outlet_result.scalar_one()

    old_status = order.status.value

    # For Mode A, try Razorpay refund before transitioning status
    refund_details = None
    if outlet.payment_mode == PaymentModeEnum.RAZORPAY_GATEWAY:
        refund_details = await create_razorpay_refund(db, order)

    order = await transition_order_status(db, order, OrderStatusEnum.REFUNDED)

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "REFUND", "Order", str(order.id),
        details={
            "payment_mode": outlet.payment_mode.value,
            "refund_details": refund_details,
        },
    )

    await broadcast_order_status_changed(
        current_user.outlet_id, order.id, old_status, OrderStatusEnum.REFUNDED.value
    )

    return order
