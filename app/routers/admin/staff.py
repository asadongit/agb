"""
Staff management FastAPI router — CRUD, PIN setup, login, PIN quick-switch, permissions, and audit trail.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.security import create_access_token, create_refresh_token
from app.dependencies import (
    AuthenticatedUser,
    DBSession,
    RequireAdmin,
    RequireSuperadmin,
    require_permission,
    tenant_scoped_query,
)
from app.models.enums import RoleEnum
from app.models.staff import Staff
from app.models.staff_audit_log import StaffAuditLog
from app.schemas.staff import (
    RolePermissions,
    SetPinRequest,
    StaffAuditLogPageResponse,
    StaffAuditLogResponse,
    StaffContextTokenResponse,
    StaffCreate,
    StaffLoginRequest,
    StaffLoginResponse,
    StaffPinSwitchRequest,
    StaffResponse,
    StaffUpdate,
)
from app.services.staff_service import (
    authenticate_staff_email,
    authenticate_staff_pin,
    create_staff,
    create_staff_audit_log,
    deactivate_staff,
    delete_staff_permanently,
    get_permissions_for_role,
    set_staff_pin,
    to_staff_response,
    update_staff,
)

router = APIRouter(prefix="/api/staff", tags=["staff"])


@router.post("", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
async def create_staff_endpoint(
    data: StaffCreate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Create a new staff member (Admin: own outlet; Superadmin: specified outlet)."""
    target_restaurant_id = data.restaurant_id or current_user.restaurant_id
    if not target_restaurant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="restaurant_id is required",
        )

    # Superadmin or Admin only
    if current_user.role != RoleEnum.SUPERADMIN and target_restaurant_id != current_user.restaurant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create staff for another outlet",
        )

    staff = await create_staff(
        db, target_restaurant_id, data, created_by_user_id=current_user.user_id
    )
    return to_staff_response(staff)


@router.get("", response_model=list[StaffResponse])
async def list_staff_endpoint(
    current_user: AuthenticatedUser,
    db: DBSession,
    restaurant_id: uuid.UUID | None = None,
):
    """List staff for an outlet (Admin: own outlet; Superadmin: filterable)."""
    target_restaurant_id = restaurant_id or current_user.restaurant_id

    stmt = select(Staff)
    stmt = tenant_scoped_query(stmt, Staff, target_restaurant_id, current_user)
    stmt = stmt.order_by(Staff.name)

    result = await db.execute(stmt)
    staff_list = result.scalars().all()
    return [to_staff_response(s) for s in staff_list]


@router.put("/{staff_id}", response_model=StaffResponse)
async def update_staff_endpoint(
    staff_id: uuid.UUID,
    data: StaffUpdate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update staff details, role, or status."""
    target_restaurant_id = current_user.restaurant_id
    if current_user.role == RoleEnum.SUPERADMIN:
        # Fetch staff first to get restaurant_id
        res = await db.execute(select(Staff).where(Staff.id == staff_id))
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Staff member not found")
        target_restaurant_id = s.restaurant_id

    if not target_restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    staff = await update_staff(db, target_restaurant_id, staff_id, data)
    return to_staff_response(staff)


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_staff_endpoint(
    staff_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
    permanent: bool = Query(False),
):
    """Deactivate or permanently delete a staff member."""
    target_restaurant_id = current_user.restaurant_id
    if current_user.role == RoleEnum.SUPERADMIN:
        res = await db.execute(select(Staff).where(Staff.id == staff_id))
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Staff member not found")
        target_restaurant_id = s.restaurant_id

    if not target_restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    if permanent or current_user.role == RoleEnum.SUPERADMIN:
        await delete_staff_permanently(db, target_restaurant_id, staff_id)
    else:
        await deactivate_staff(db, target_restaurant_id, staff_id)


@router.post("/{staff_id}/set-pin", status_code=status.HTTP_200_OK)
async def set_staff_pin_endpoint(
    staff_id: uuid.UUID,
    data: SetPinRequest,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Admin/Superadmin sets a staff member's 4-digit PIN."""
    target_restaurant_id = current_user.restaurant_id
    if current_user.role == RoleEnum.SUPERADMIN:
        res = await db.execute(select(Staff).where(Staff.id == staff_id))
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Staff member not found")
        target_restaurant_id = s.restaurant_id

    if not target_restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    await set_staff_pin(db, target_restaurant_id, staff_id, data.pin)
    return {"message": "Staff PIN set successfully"}


@router.post("/set-my-pin", status_code=status.HTTP_200_OK)
async def set_my_pin_endpoint(
    data: SetPinRequest,
    current_user: AuthenticatedUser,
    db: DBSession,
):
    """Staff member sets their own PIN."""
    if not current_user.restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    await set_staff_pin(db, current_user.restaurant_id, current_user.user_id, data.pin)
    return {"message": "Your PIN has been updated successfully"}


@router.post("/login", response_model=StaffLoginResponse)
async def staff_login_endpoint(
    data: StaffLoginRequest,
    db: DBSession,
):
    """Staff login via email and password."""
    staff = await authenticate_staff_email(db, data.email, data.password)

    access_token = create_access_token(
        user_id=staff.id,
        restaurant_id=staff.restaurant_id,
        role=staff.role.value,
    )
    refresh_token = create_refresh_token(
        user_id=staff.id,
        restaurant_id=staff.restaurant_id,
        role=staff.role.value,
    )

    await create_staff_audit_log(
        db,
        restaurant_id=staff.restaurant_id,
        staff_id=staff.id,
        action_type="staff_logged_in",
        reference_type="Staff",
        reference_id=str(staff.id),
        details=f"Staff '{staff.name}' logged in via email/password",
    )

    return StaffLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        staff=to_staff_response(staff),
    )


@router.post("/pin-switch", response_model=StaffContextTokenResponse)
async def pin_switch_endpoint(
    data: StaffPinSwitchRequest,
    current_user: AuthenticatedUser,
    db: DBSession,
):
    """
    PIN Quick-Switch on a shared counter/kitchen device.
    Verifies staff PIN and returns a short-lived Staff Context Token layered on the device session.
    """
    target_restaurant_id = current_user.restaurant_id
    if not target_restaurant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active outlet session required for PIN quick-switch",
        )

    staff = await authenticate_staff_pin(
        db, target_restaurant_id, data.staff_id, data.pin
    )

    staff_context_token = create_access_token(
        user_id=staff.id,
        restaurant_id=staff.restaurant_id,
        role=staff.role.value,
    )

    await create_staff_audit_log(
        db,
        restaurant_id=staff.restaurant_id,
        staff_id=staff.id,
        action_type="pin_quick_switch",
        reference_type="Staff",
        reference_id=str(staff.id),
        details=f"Switched active staff to '{staff.name}' via PIN",
    )

    return StaffContextTokenResponse(
        staff_context_token=staff_context_token,
        active_staff=to_staff_response(staff),
    )


@router.get("/permissions", response_model=RolePermissions)
async def get_permissions_endpoint(
    current_user: AuthenticatedUser,
):
    """Fetch role -> permission matrix for current user."""
    return get_permissions_for_role(current_user.role)


@router.get("/audit-log", response_model=StaffAuditLogPageResponse)
async def list_staff_audit_log_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    staff_id: uuid.UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """Get paginated staff audit trail."""
    stmt = (
        select(StaffAuditLog)
        .options(selectinload(StaffAuditLog.staff))
        .where(StaffAuditLog.restaurant_id == current_user.restaurant_id)
    )

    if staff_id:
        stmt = stmt.where(StaffAuditLog.staff_id == staff_id)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar_one() or 0

    offset = (page - 1) * page_size
    stmt = stmt.order_by(StaffAuditLog.created_at.desc()).offset(offset).limit(page_size)
    res = await db.execute(stmt)
    rows = res.scalars().all()

    items = [
        StaffAuditLogResponse(
            id=r.id,
            staff_id=r.staff_id,
            staff_name=r.staff.name if r.staff else None,
            restaurant_id=r.restaurant_id,
            action_type=r.action_type,
            reference_type=r.reference_type,
            reference_id=r.reference_id,
            details=r.details,
            created_at=r.created_at,
        )
        for r in rows
    ]

    total_pages = max(1, math.ceil(total / page_size))
    return StaffAuditLogPageResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
