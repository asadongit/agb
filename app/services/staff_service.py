"""
Staff service — CRUD operations, password & PIN hashing/verification, role permissions mapping, and audit trail logging.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.models.enums import RoleEnum
from app.models.staff import Staff
from app.models.staff_audit_log import StaffAuditLog
from app.schemas.staff import (
    RolePermissions,
    StaffCreate,
    StaffResponse,
    StaffUpdate,
)

# ------------------------------------------------------------------
# Fixed Role Permission Mapping Matrix
# ------------------------------------------------------------------
ROLE_PERMISSIONS_MAP: dict[RoleEnum, RolePermissions] = {
    RoleEnum.SUPERADMIN: RolePermissions(
        can_manage_staff=True,
        can_manage_billing=True,
        can_edit_menu=True,
        can_manage_inventory=True,
        can_cancel_orders=True,
        can_process_payments=True,
        can_manage_orders=True,
        can_view_analytics=True,
        allowed_sidebar_tabs=["orders", "menu", "staff", "inventory", "settings", "qrcodes"],
    ),
    RoleEnum.RESTAURANT_ADMIN: RolePermissions(
        can_manage_staff=True,
        can_manage_billing=True,
        can_edit_menu=True,
        can_manage_inventory=True,
        can_cancel_orders=True,
        can_process_payments=True,
        can_manage_orders=True,
        can_view_analytics=True,
        allowed_sidebar_tabs=["orders", "menu", "staff", "inventory", "settings", "qrcodes"],
    ),
    RoleEnum.MANAGER: RolePermissions(
        can_manage_staff=False,
        can_manage_billing=False,
        can_edit_menu=True,
        can_manage_inventory=True,
        can_cancel_orders=True,
        can_process_payments=True,
        can_manage_orders=True,
        can_view_analytics=True,
        allowed_sidebar_tabs=["orders", "menu", "inventory", "qrcodes"],
    ),
    RoleEnum.FLOOR_STAFF: RolePermissions(
        can_manage_staff=False,
        can_manage_billing=False,
        can_edit_menu=False,
        can_manage_inventory=False,
        can_cancel_orders=False,
        can_process_payments=False,
        can_manage_orders=True,
        can_view_analytics=False,
        allowed_sidebar_tabs=["orders"],
    ),
    RoleEnum.CASHIER: RolePermissions(
        can_manage_staff=False,
        can_manage_billing=False,
        can_edit_menu=False,
        can_manage_inventory=False,
        can_cancel_orders=False,
        can_process_payments=True,
        can_manage_orders=True,
        can_view_analytics=False,
        allowed_sidebar_tabs=["orders"],
    ),
    RoleEnum.WAITER: RolePermissions(
        can_manage_staff=False,
        can_manage_billing=False,
        can_edit_menu=False,
        can_manage_inventory=False,
        can_cancel_orders=False,
        can_process_payments=False,
        can_manage_orders=True,
        can_view_analytics=False,
        allowed_sidebar_tabs=["orders"],
    ),
    RoleEnum.STAFF: RolePermissions(
        can_manage_staff=False,
        can_manage_billing=False,
        can_edit_menu=False,
        can_manage_inventory=False,
        can_cancel_orders=False,
        can_process_payments=False,
        can_manage_orders=True,
        can_view_analytics=False,
        allowed_sidebar_tabs=["orders"],
    ),
}


def get_permissions_for_role(role: RoleEnum) -> RolePermissions:
    """Return permissions object for a role."""
    return ROLE_PERMISSIONS_MAP.get(role, ROLE_PERMISSIONS_MAP[RoleEnum.STAFF])


def to_staff_response(staff: Staff) -> StaffResponse:
    """Helper to convert Staff model to StaffResponse Pydantic schema."""
    return StaffResponse(
        id=staff.id,
        restaurant_id=staff.restaurant_id,
        name=staff.name,
        email=staff.email,
        phone=staff.phone,
        role=staff.role,
        status=staff.status,
        has_pin=staff.pin_hash is not None,
        created_at=staff.created_at,
        updated_at=staff.updated_at,
    )


async def create_staff(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    data: StaffCreate,
    created_by_user_id: uuid.UUID | None = None,
) -> Staff:
    """Create a new staff member for an outlet."""
    # Check email uniqueness in outlet
    existing = await db.execute(
        select(Staff).where(
            Staff.restaurant_id == restaurant_id,
            Staff.email == data.email.lower().strip(),
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Staff with email '{data.email}' already exists in this outlet.",
        )

    pwd_hash = hash_password(data.password)
    p_hash = hash_password(data.pin) if data.pin else None

    staff = Staff(
        id=uuid.uuid4(),
        restaurant_id=restaurant_id,
        name=data.name.strip(),
        email=data.email.lower().strip(),
        phone=data.phone.strip() if data.phone else None,
        role=data.role,
        password_hash=pwd_hash,
        pin_hash=p_hash,
        status="active",
        created_by=created_by_user_id,
    )
    db.add(staff)
    await db.flush()
    await db.refresh(staff)

    await create_staff_audit_log(
        db,
        restaurant_id=restaurant_id,
        staff_id=staff.id,
        action_type="staff_created",
        reference_type="Staff",
        reference_id=str(staff.id),
        details=f"Created staff '{staff.name}' with role {staff.role.value}",
    )

    return staff


async def update_staff(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    staff_id: uuid.UUID,
    data: StaffUpdate,
) -> Staff:
    """Update staff profile, role, or active status."""
    res = await db.execute(
        select(Staff).where(
            Staff.id == staff_id,
            Staff.restaurant_id == restaurant_id,
        )
    )
    staff = res.scalar_one_or_none()
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    if data.name is not None:
        staff.name = data.name.strip()
    if data.email is not None:
        staff.email = data.email.lower().strip()
    if data.phone is not None:
        staff.phone = data.phone.strip()
    if data.role is not None:
        staff.role = data.role
    if data.status is not None:
        staff.status = data.status

    await db.flush()
    await db.refresh(staff)

    await create_staff_audit_log(
        db,
        restaurant_id=restaurant_id,
        staff_id=staff.id,
        action_type="staff_updated",
        reference_type="Staff",
        reference_id=str(staff.id),
        details=f"Updated staff '{staff.name}'",
    )

    return staff


async def deactivate_staff(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    staff_id: uuid.UUID,
) -> None:
    """Soft-delete/deactivate a staff member to preserve audit trail integrity."""
    res = await db.execute(
        select(Staff).where(
            Staff.id == staff_id,
            Staff.restaurant_id == restaurant_id,
        )
    )
    staff = res.scalar_one_or_none()
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    staff.status = "inactive"
    await db.flush()

    await create_staff_audit_log(
        db,
        restaurant_id=restaurant_id,
        staff_id=staff.id,
        action_type="staff_deactivated",
        reference_type="Staff",
        reference_id=str(staff.id),
        details=f"Deactivated staff '{staff.name}'",
    )


async def set_staff_pin(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    staff_id: uuid.UUID,
    pin: str,
) -> None:
    """Set or update 4-digit PIN for a staff member."""
    res = await db.execute(
        select(Staff).where(
            Staff.id == staff_id,
            Staff.restaurant_id == restaurant_id,
        )
    )
    staff = res.scalar_one_or_none()
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    staff.pin_hash = hash_password(pin)
    await db.flush()

    await create_staff_audit_log(
        db,
        restaurant_id=restaurant_id,
        staff_id=staff.id,
        action_type="staff_pin_updated",
        reference_type="Staff",
        reference_id=str(staff.id),
        details=f"Updated PIN for staff '{staff.name}'",
    )


async def authenticate_staff_email(
    db: AsyncSession,
    email: str,
    password: str,
) -> Staff:
    """Authenticate staff via email and password."""
    res = await db.execute(
        select(Staff).where(
            Staff.email == email.lower().strip(),
            Staff.status == "active",
        )
    )
    staff = res.scalar_one_or_none()
    if not staff or not verify_password(password, staff.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    return staff


async def authenticate_staff_pin(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    staff_id: uuid.UUID,
    pin: str,
) -> Staff:
    """Authenticate staff via PIN on a shared outlet device."""
    res = await db.execute(
        select(Staff).where(
            Staff.id == staff_id,
            Staff.restaurant_id == restaurant_id,
            Staff.status == "active",
        )
    )
    staff = res.scalar_one_or_none()
    if not staff or not staff.pin_hash or not verify_password(pin, staff.pin_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid staff PIN.",
        )

    return staff


async def create_staff_audit_log(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    staff_id: uuid.UUID | None,
    action_type: str,
    reference_type: str | None = None,
    reference_id: str | None = None,
    details: str | None = None,
) -> StaffAuditLog:
    """Write an entry to staff_audit_log."""
    log_entry = StaffAuditLog(
        id=uuid.uuid4(),
        staff_id=staff_id,
        restaurant_id=restaurant_id,
        action_type=action_type,
        reference_type=reference_type,
        reference_id=reference_id,
        details=details,
    )
    db.add(log_entry)
    await db.flush()
    return log_entry
