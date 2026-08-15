"""
Purchase Return & Batch Adjustment Pydantic Schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field


class BatchAdjustmentRequest(BaseModel):
    adjustment_type: str = Field(..., description="PURCHASE_RETURN, MANUAL_ADJUSTMENT, or VOID_BATCH")
    quantity: Decimal = Field(..., ge=Decimal("0.001"), description="Quantity to reduce or return")
    reason: str = Field(default="OTHER", description="Reason for return or adjustment")
    supplier_name: str | None = Field(default=None, description="Supplier name for return bill")
    return_rate: Decimal | None = Field(default=None, description="Custom unit cost rate for return bill")
    notes: str | None = Field(default=None, description="Optional staff notes")


class PurchaseReturnResponse(BaseModel):
    id: uuid.UUID
    return_number: str
    outlet_id: uuid.UUID
    intake_id: uuid.UUID | None
    item_id: uuid.UUID
    item_name: str | None = None
    supplier_name: str
    batch_number: str | None
    quantity: Decimal
    unit_cost: Decimal
    total_refund_amount: Decimal
    reason: str
    notes: str | None
    created_by: uuid.UUID | None
    created_by_name: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
