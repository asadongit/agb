"""
Customer Pydantic schemas — requests and responses for Admin customer management.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.common import BaseResponse, StrictSchema


class CustomerCreate(StrictSchema):
    name: str = Field(..., min_length=1, max_length=255)
    phone: str = Field(..., min_length=3, max_length=20)

    @field_validator("name", "phone", mode="before")
    @classmethod
    def strip_whitespace(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v


class CustomerResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    name: str
    phone: str
    total_orders: int = 0
    total_spent: float = 0.0
    created_at: datetime
    updated_at: datetime
