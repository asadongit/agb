"""
Order schemas — checkout, status updates, responses.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import OrderStatusEnum, PaymentModeEnum
from app.schemas.common import BaseResponse, StrictSchema


# ── Order creation ───────────────────────────────────────────────────────


class OrderItemRequest(StrictSchema):
    menu_item_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    quantity: Decimal = Field(gt=0, le=1000)


class CheckoutRequest(StrictSchema):
    """Customer-facing checkout — total is computed server-side, never trusted from client."""
    restaurant_slug: str
    table_number: str = Field(min_length=1, max_length=50)
    customer_name: str | None = Field(None, max_length=255)
    customer_phone: str | None = Field(None, max_length=20)
    payment_mode: PaymentModeEnum = PaymentModeEnum.PAY_AT_COUNTER
    session_id: uuid.UUID | None = None
    items: list[OrderItemRequest] = Field(min_length=1)


# ── Order responses ──────────────────────────────────────────────────────


class OrderItemResponse(BaseResponse):
    id: uuid.UUID
    menu_item_id: uuid.UUID
    variant_id: uuid.UUID | None
    quantity: Decimal
    unit_price: Decimal


class OrderResponse(BaseResponse):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    session_id: uuid.UUID | None = None
    table_number: str
    customer_name: str | None
    customer_phone: str | None
    total_amount: Decimal
    status: OrderStatusEnum
    payment_reference: str | None
    source: str = "qr"
    is_auto_verified: bool = False
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse] = []


# ── Razorpay checkout response ──────────────────────────────────────────


class RazorpayCheckoutResponse(BaseResponse):
    order_id: uuid.UUID
    razorpay_order_id: str
    amount: int  # in paise
    currency: str = "INR"
    key_id: str


# ── Pay After Meal checkout response ───────────────────────────────────


class PayAfterMealCheckoutResponse(BaseResponse):
    order_id: uuid.UUID
    total_amount: Decimal


# ── Status updates ───────────────────────────────────────────────────────


class OrderStatusUpdate(StrictSchema):
    status: OrderStatusEnum


class ClaimPaidRequest(StrictSchema):
    """Customer claims they've paid (Mode B only)."""
    utr_number: str | None = Field(
        None,
        description="Optional 12-digit UTR / transaction reference number entered by diner",
        max_length=50,
    )


class ConfirmPaymentRequest(StrictSchema):
    """Staff confirms payment (Mode B only)."""
    payment_reference: str | None = Field(
        None,
        description="Optional UTR / transaction reference entered by staff",
        max_length=255,
    )
