"""
Order public routes — checkout (both modes), claim paid (Mode B).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.rate_limit import limiter
from app.dependencies import DBSession
from app.models.enums import OrderStatusEnum, PaymentModeEnum
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.schemas.order import (
    CheckoutRequest,
    ClaimPaidRequest,
    OrderResponse,
    RazorpayCheckoutResponse,
    PayAfterMealCheckoutResponse,
)
from app.services.order_service import create_order
from app.services.payment_service import (
    create_razorpay_order,
)
from app.services.websocket_service import broadcast_verification_needed

router = APIRouter(prefix="/api/orders", tags=["orders"])


import logging

logger = logging.getLogger(__name__)


@router.post("/checkout", status_code=status.HTTP_201_CREATED)
async def checkout(
    data: CheckoutRequest,
    db: DBSession,
):
    """
    Create an order and initiate payment.
    Total is computed server-side — NEVER trust a client-submitted total.

    Returns different response based on restaurant's payment_mode:
    - RAZORPAY_GATEWAY: Razorpay order details for frontend checkout widget
    - PAY_AT_COUNTER: Pay At Counter confirmation response
    """
    # Look up restaurant
    result = await db.execute(
        select(Restaurant).where(Restaurant.slug == data.restaurant_slug)
    )
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Restaurant '{data.restaurant_slug}' not found",
        )

    # Verify requested payment mode is enabled by restaurant
    requested_mode = data.payment_mode
    allowed_modes = {restaurant.payment_mode}
    if restaurant.payment_mode == PaymentModeEnum.BOTH:
        allowed_modes = {PaymentModeEnum.RAZORPAY_GATEWAY, PaymentModeEnum.PAY_AT_COUNTER}

    if requested_mode not in allowed_modes:
        readable_mode = "Razorpay Gateway" if requested_mode == PaymentModeEnum.RAZORPAY_GATEWAY else "Pay At Counter"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{readable_mode} is not enabled for this outlet. Please try another payment method.",
        )

    # Create new order (server-side pricing)
    order = await create_order(db, data)

    if requested_mode == PaymentModeEnum.RAZORPAY_GATEWAY:
        # Mode A: Create Razorpay order
        rz_data = await create_razorpay_order(db, order, restaurant)
        return RazorpayCheckoutResponse(
            order_id=order.id,
            razorpay_order_id=rz_data["razorpay_order_id"],
            amount=rz_data["amount"],
            currency=rz_data["currency"],
            key_id=rz_data["key_id"],
        )
    else:
        # Mode B: Pay At Counter (Verify/collect at basket counter)
        if order.is_auto_verified:
            order.status = OrderStatusEnum.COMPLETED
            from app.services.inventory_service import process_order_auto_deduction
            await process_order_auto_deduction(db, order)
        else:
            order.status = OrderStatusEnum.PENDING_VERIFICATION
        await db.flush()

        # Broadcast to staff dashboard
        if not order.is_auto_verified:
            await broadcast_verification_needed(
                restaurant_id=restaurant.id,
                order_id=order.id,
                table_number=order.table_number,
            )

        return PayAfterMealCheckoutResponse(
            order_id=order.id,
            total_amount=order.total_amount,
        )


@router.post("/{order_id}/claim-paid")
@limiter.limit("3/minute")
async def claim_paid(
    order_id: uuid.UUID,
    request: Request,
    db: DBSession,
    body: ClaimPaidRequest | None = None,
):
    """
    Customer claims they've paid (Mode B only).
    Optionally records diner-entered 12-digit UTR transaction reference number.
    Triggers VERIFICATION_NEEDED WebSocket event to staff dashboard.
    """
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    if order.status != OrderStatusEnum.PENDING_VERIFICATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order is not awaiting payment verification",
        )

    if body and body.utr_number and body.utr_number.strip():
        order.payment_reference = body.utr_number.strip()
        await db.flush()

    # Broadcast to kitchen/staff dashboard
    await broadcast_verification_needed(
        restaurant_id=order.restaurant_id,
        order_id=order.id,
        table_number=order.table_number,
    )

    return {"message": "Verification request sent to staff", "order_id": str(order.id)}


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order_status(
    order_id: uuid.UUID,
    db: DBSession,
):
    """Public endpoint to check order status (for customer tracking)."""
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    return order


@router.get("/{order_id}/receipt")
async def get_order_receipt(
    order_id: uuid.UUID,
    db: DBSession,
):
    """
    Public endpoint to fetch structured receipt data for paid orders.
    Returns store branding, itemized tax calculation breakdown, and IST timestamps.
    """
    from app.models.menu_item import MenuItem
    from app.services.receipt_service import calculate_order_receipt

    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    # Fetch Restaurant
    rest_result = await db.execute(
        select(Restaurant).where(Restaurant.id == order.restaurant_id)
    )
    restaurant = rest_result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found",
        )

    # Fetch Menu Item Names
    item_ids = [item.menu_item_id for item in order.items]
    menu_items_map = {}
    if item_ids:
        items_result = await db.execute(
            select(MenuItem).where(MenuItem.id.in_(item_ids))
        )
        menu_items_map = {str(item.id): {"name": item.name, "image_url": item.image_url} for item in items_result.scalars().all()}

    receipt_data = calculate_order_receipt(order, restaurant, menu_items_map)
    return receipt_data
