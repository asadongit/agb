"""
Staff service — CRUD operations, password & PIN hashing/verification, role permissions mapping, and audit trail logging.
Operates on the unified User database model.
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
from app.models.user import User
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
        allowed_sidebar_tabs=["orders", "billing", "menu", "staff", "analytics", "inventory", "customerservices", "settings", "qrcodes"],
    ),
    RoleEnum.OUTLET_ADMIN: RolePermissions(
        can_manage_staff=True,
        can_manage_billing=True,
        can_edit_menu=True,
        can_manage_inventory=True,
        can_cancel_orders=True,
        can_process_payments=True,
        can_manage_orders=True,
        can_view_analytics=True,
        allowed_sidebar_tabs=["orders", "billing", "menu", "staff", "analytics", "inventory", "customerservices", "settings", "qrcodes"],
    ),
    RoleEnum.MANAGER: RolePermissions(
        can_manage_staff=True,
        can_manage_billing=True,
        can_edit_menu=True,
        can_manage_inventory=True,
        can_cancel_orders=True,
        can_process_payments=True,
        can_manage_orders=True,
        can_view_analytics=True,
        allowed_sidebar_tabs=["orders", "billing", "menu", "staff", "analytics", "inventory", "customerservices", "settings", "qrcodes"],
    ),
    RoleEnum.CASHIER: RolePermissions(
        can_manage_staff=False,
        can_manage_billing=True,
        can_edit_menu=False,
        can_manage_inventory=False,
        can_cancel_orders=False,
        can_process_payments=True,
        can_manage_orders=True,
        can_view_analytics=False,
        allowed_sidebar_tabs=["billing", "orders"],
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
    RoleEnum.DELIVERY_BOY: RolePermissions(
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


def to_staff_response(user: User) -> StaffResponse:
    """Helper to convert User model to StaffResponse Pydantic schema."""
    return StaffResponse(
        id=user.id,
        outlet_id=user.outlet_id,
        name=user.name or (user.email.split("@")[0].title() if user.email else "Team Member"),
        email=user.email,
        phone=user.phone,
        role=user.role,
        status=user.status,
        has_pin=user.pin_hash is not None,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


async def create_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    data: StaffCreate,
    created_by_user_id: uuid.UUID | None = None,
) -> User:
    """Create a new staff member (User) for an outlet."""
    existing = await db.execute(
        select(User).where(
            User.email == data.email.lower().strip(),
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{data.email}' already exists.",
        )

    pwd_hash = hash_password(data.password)
    p_hash = hash_password(data.pin) if data.pin else None

    user = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name=data.name.strip(),
        email=data.email.lower().strip(),
        phone=data.phone.strip() if data.phone else None,
        role=data.role,
        password_hash=pwd_hash,
        pin_hash=p_hash,
        is_active=True,
        status="active",
        created_by=created_by_user_id,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=user.id,
        action_type="staff_created",
        reference_type="User",
        reference_id=str(user.id),
        details=f"Created staff '{user.name}' with role {user.role.value}",
    )

    return user


async def update_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    data: StaffUpdate,
) -> User:
    """Update staff profile, role, or active status."""
    res = await db.execute(
        select(User).where(
            User.id == staff_id,
            User.outlet_id == outlet_id,
        )
    )
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    if data.name is not None:
        user.name = data.name.strip()
    if data.email is not None:
        user.email = data.email.lower().strip()
    if data.phone is not None:
        user.phone = data.phone.strip()
    if data.role is not None:
        user.role = data.role
    if data.status is not None:
        user.status = data.status
        user.is_active = (data.status == "active")

    await db.flush()
    await db.refresh(user)

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=user.id,
        action_type="staff_updated",
        reference_type="User",
        reference_id=str(user.id),
        details=f"Updated staff '{user.name}'",
    )

    return user


async def deactivate_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
) -> None:
    """Soft-delete/deactivate a staff member."""
    res = await db.execute(
        select(User).where(
            User.id == staff_id,
            User.outlet_id == outlet_id,
        )
    )
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    user.status = "inactive"
    user.is_active = False
    await db.flush()

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=user.id,
        action_type="staff_deactivated",
        reference_type="User",
        reference_id=str(user.id),
        details=f"Deactivated staff '{user.name}'",
    )


async def delete_staff_permanently(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
) -> None:
    """Permanently delete a staff member from the database."""
    res = await db.execute(
        select(User).where(
            User.id == staff_id,
            User.outlet_id == outlet_id,
        )
    )
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    user_name = user.name
    user_email = user.email

    await db.delete(user)
    await db.flush()

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=None,
        action_type="staff_permanently_deleted",
        reference_type="User",
        reference_id=str(staff_id),
        details=f"Permanently deleted staff '{user_name}' ({user_email})",
    )


async def set_staff_pin(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    pin: str,
) -> None:
    """Set or update 4-digit PIN for a staff member or admin user."""
    res = await db.execute(
        select(User).where(
            User.id == staff_id,
            User.outlet_id == outlet_id,
        )
    )
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    user.pin_hash = hash_password(pin)
    await db.flush()

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=user.id,
        action_type="staff_pin_updated",
        reference_type="User",
        reference_id=str(user.id),
        details=f"Updated PIN for '{user.name}'",
    )


async def authenticate_staff_email(
    db: AsyncSession,
    email: str,
    password: str,
) -> User:
    """Authenticate staff via email and password."""
    res = await db.execute(
        select(User).where(
            User.email == email.lower().strip(),
            User.is_active == True,
        )
    )
    user = res.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    return user


async def authenticate_staff_pin(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    pin: str,
) -> User:
    """Authenticate staff via PIN on a shared outlet device."""
    res = await db.execute(
        select(User).where(
            User.id == staff_id,
            User.outlet_id == outlet_id,
            User.is_active == True,
        )
    )
    user = res.scalar_one_or_none()
    if not user or not user.pin_hash or not verify_password(pin, user.pin_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid staff PIN.",
        )

    return user


async def authenticate_staff_pin_standalone(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    pin: str,
) -> User:
    """Authenticate staff on an outlet device by PIN alone."""
    res = await db.execute(
        select(User).where(
            User.outlet_id == outlet_id,
            User.is_active == True,
            User.pin_hash.isnot(None),
        )
    )
    users_list = res.scalars().all()
    for u in users_list:
        if u.pin_hash and verify_password(pin, u.pin_hash):
            return u

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid staff PIN for this outlet.",
    )


async def create_staff_audit_log(
    db: AsyncSession,
    outlet_id: uuid.UUID,
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
        outlet_id=outlet_id,
        action_type=action_type,
        reference_type=reference_type,
        reference_id=reference_id,
        details=details,
    )
    db.add(log_entry)
    await db.flush()
    return log_entry
