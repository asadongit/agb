"""
Restaurant schemas — CRUD request/response.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import PaymentModeEnum
from app.schemas.common import BaseResponse, StrictSchema


class RestaurantCreate(StrictSchema):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    payment_mode: PaymentModeEnum
    razorpay_account_id: str | None = None
    direct_upi_id: str | None = None
    raw_upi_payload: str | None = None
    logo_url: str | None = None
    address: str | None = None
    phone: str | None = None
    gstin: str | None = None
    fssai_no: str | None = None
    session_duration_minutes: int = Field(default=30, ge=5, le=120)
    verification_amount_cutoff: Decimal | None = Field(None, ge=0)
    flagged_item_ids: list[str] = Field(default_factory=list)


class RestaurantUpdate(StrictSchema):
    name: str | None = Field(None, min_length=1, max_length=255)
    slug: str | None = Field(None, min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    payment_mode: PaymentModeEnum | None = None
    razorpay_account_id: str | None = None
    direct_upi_id: str | None = None
    raw_upi_payload: str | None = None
    logo_url: str | None = None
    address: str | None = None
    phone: str | None = None
    gstin: str | None = None
    fssai_no: str | None = None
    session_duration_minutes: int | None = Field(None, ge=5, le=120)
    verification_amount_cutoff: Decimal | None = Field(None, ge=0)
    flagged_item_ids: list[str] | None = None


class RestaurantResponse(BaseResponse):
    id: uuid.UUID
    name: str
    slug: str
    payment_mode: PaymentModeEnum
    razorpay_account_id: str | None
    direct_upi_id: str | None
    raw_upi_payload: str | None
    logo_url: str | None = None
    address: str | None = None
    phone: str | None = None
    gstin: str | None = None
    fssai_no: str | None = None
    session_duration_minutes: int = 30
    verification_amount_cutoff: Decimal | None = None
    flagged_item_ids: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class UserSummaryResponse(BaseResponse):
    id: uuid.UUID
    email: str
    role: str
    is_active: bool
    created_at: datetime


class RestaurantWithUsersResponse(RestaurantResponse):
    users: list[UserSummaryResponse] = []


RestaurantCreate.model_rebuild()
RestaurantUpdate.model_rebuild()
RestaurantResponse.model_rebuild()
RestaurantWithUsersResponse.model_rebuild()
