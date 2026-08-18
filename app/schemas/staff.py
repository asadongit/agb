"""
Staff schemas — CRUD requests/responses, PIN setup, login, PIN quick-switch, permissions, and audit logs.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import EmailStr, Field, computed_field

from app.models.enums import RoleEnum
from app.schemas.common import BaseResponse, StrictSchema


class StaffCreate(StrictSchema):
    outlet_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = Field(None, max_length=50)
    role: RoleEnum = Field(default=RoleEnum.WAITER)
    password: str = Field(min_length=6, max_length=100)
    pin: str | None = Field(None, min_length=4, max_length=6)


class StaffUpdate(StrictSchema):
    name: str | None = Field(None, min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    role: RoleEnum | None = None
    status: str | None = Field(None, pattern="^(active|inactive)$")


class StaffResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    name: str
    email: str
    phone: str | None
    role: RoleEnum
    status: str
    has_pin: bool
    created_at: datetime
    updated_at: datetime


class SetPinRequest(StrictSchema):
    pin: str = Field(min_length=4, max_length=6, pattern="^[0-9]+$")


class StaffLoginRequest(StrictSchema):
    email: EmailStr
    password: str


class StaffPinSwitchRequest(StrictSchema):
    staff_id: uuid.UUID
    pin: str = Field(min_length=4, max_length=6, pattern="^[0-9]+$")


class StaffPinLoginRequest(StrictSchema):
    outlet_id: uuid.UUID
    pin: str = Field(min_length=4, max_length=6, pattern="^[0-9]+$")


class StaffLoginResponse(BaseResponse):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    staff: StaffResponse


class StaffContextTokenResponse(BaseResponse):
    staff_context_token: str
    token_type: str = "bearer"
    active_staff: StaffResponse


class RolePermissions(StrictSchema):
    can_manage_staff: bool
    can_manage_billing: bool
    can_edit_menu: bool
    can_manage_inventory: bool
    can_cancel_orders: bool
    can_process_payments: bool
    can_manage_orders: bool
    can_view_analytics: bool
    allowed_sidebar_tabs: list[str]


class StaffAuditLogResponse(BaseResponse):
    id: uuid.UUID
    staff_id: uuid.UUID | None
    staff_name: str | None = None
    outlet_id: uuid.UUID
    action_type: str
    reference_type: str | None
    reference_id: str | None
    details: str | None
    created_at: datetime


class StaffAuditLogPageResponse(BaseResponse):
    items: list[StaffAuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
