"""
Billing Pydantic schemas — requests and responses for manual bill creation, discounts, approvals, and cash/UPI payments.
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from app.schemas.common import BaseResponse, StrictSchema


class BillItemInput(StrictSchema):
    menu_item_id: str | None = None
    variant_id: str | None = None
    item_name: str | None = None
    quantity: Decimal = Field(..., gt=0)
    unit_price: Decimal | None = Field(None, ge=0)
    pricing_type: str = Field(default="RETAIL", pattern="^(RETAIL|WHOLESALE)$")
    is_complimentary: bool = False


class CreateManualBillRequest(StrictSchema):
    basket_number: str = "WALK-IN"
    customer_name: str | None = None
    customer_phone: str | None = None
    items: list[BillItemInput] = Field(default_factory=list)


class UpdateManualBillRequest(StrictSchema):
    basket_number: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    items: list[BillItemInput] = Field(default_factory=list)


class ApplyDiscountRequest(StrictSchema):
    discount_type: str = Field(..., pattern="^(PERCENT|FLAT|COMPLIMENTARY)$")
    discount_value: float = Field(0.0, ge=0.0)
    reason_note: str = Field(..., min_length=2, max_length=500)


class ApproveDiscountRequest(StrictSchema):
    approve: bool


class MarkPaidRequest(StrictSchema):
    payment_method: str = Field(..., pattern="^(CASH|UPI)$")
    cash_denominations: dict[str, int] | None = None


class BillItemResponse(StrictSchema):
    id: str
    menu_item_id: str | None = None
    variant_id: str | None = None
    item_name: str
    quantity: float
    unit_price: float
    is_complimentary: bool
    line_total: float


class BillResponse(BaseResponse):
    id: str
    outlet_id: str
    basket_number: str
    customer_name: str | None = None
    customer_phone: str | None = None
    status: str
    source: str
    subtotal_amount: float
    total_amount: float
    discount_type: str | None = None
    discount_value: float | None = None
    discount_reason: str | None = None
    discount_status: str | None = None
    payment_method: str | None = None
    created_by_staff_id: str | None = None
    created_at: str
    finalized_at: str | None = None
    paid_at: str | None = None
    items: list[BillItemResponse] = Field(default_factory=list)


class DiscountApprovalResponse(BaseResponse):
    id: str
    order_id: str
    requested_by_id: str
    requested_by_name: str | None = None
    approved_by_id: str | None = None
    status: str
    discount_type: str
    discount_value: float
    reason_note: str
    created_at: str
    order_basket_number: str
    order_total_amount: float
