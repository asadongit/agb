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

from app.core.security import create_access_token, create_refresh_token, hash_token
from app.dependencies import (
    AuthenticatedUser,
    DBSession,
    RequireAdmin,
    RequireSuperadmin,
    require_permission,
    outlet_scoped_query,
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
    target_outlet_id = data.outlet_id or current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="outlet_id is required",
        )

    # Superadmin or Admin only
    if current_user.role != RoleEnum.SUPERADMIN and target_outlet_id != current_user.outlet_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create staff for another outlet",
        )

    staff = await create_staff(
        db, target_outlet_id, data, created_by_user_id=current_user.user_id
    )
    return to_staff_response(staff)


@router.get("", response_model=list[StaffResponse])
async def list_staff_endpoint(
    current_user: AuthenticatedUser,
    db: DBSession,
    outlet_id: uuid.UUID | None = None,
):
    """List staff for an outlet (Admin: own outlet; Superadmin: filterable)."""
    target_outlet_id = outlet_id or current_user.outlet_id

    stmt = select(Staff)
    stmt = outlet_scoped_query(stmt, Staff, target_outlet_id, current_user)
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
    target_outlet_id = current_user.outlet_id
    if current_user.role == RoleEnum.SUPERADMIN:
        # Fetch staff first to get outlet_id
        res = await db.execute(select(Staff).where(Staff.id == staff_id))
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Staff member not found")
        target_outlet_id = s.outlet_id

    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    staff = await update_staff(db, target_outlet_id, staff_id, data)
    return to_staff_response(staff)


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_staff_endpoint(
    staff_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
    permanent: bool = Query(False),
):
    """Deactivate or permanently delete a staff member."""
    target_outlet_id = current_user.outlet_id
    if current_user.role == RoleEnum.SUPERADMIN:
        res = await db.execute(select(Staff).where(Staff.id == staff_id))
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Staff member not found")
        target_outlet_id = s.outlet_id

    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    if permanent or current_user.role == RoleEnum.SUPERADMIN:
        await delete_staff_permanently(db, target_outlet_id, staff_id)
    else:
        await deactivate_staff(db, target_outlet_id, staff_id)


@router.post("/{staff_id}/set-pin", status_code=status.HTTP_200_OK)
async def set_staff_pin_endpoint(
    staff_id: uuid.UUID,
    data: SetPinRequest,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Admin/Superadmin sets a staff member's 4-digit PIN."""
    target_outlet_id = current_user.outlet_id
    if current_user.role == RoleEnum.SUPERADMIN:
        res = await db.execute(select(Staff).where(Staff.id == staff_id))
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Staff member not found")
        target_outlet_id = s.outlet_id

    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    await set_staff_pin(db, target_outlet_id, staff_id, data.pin)
    return {"message": "Staff PIN set successfully"}


@router.post("/set-my-pin", status_code=status.HTTP_200_OK)
async def set_my_pin_endpoint(
    data: SetPinRequest,
    current_user: AuthenticatedUser,
    db: DBSession,
):
    """Staff member sets their own PIN."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    await set_staff_pin(db, current_user.outlet_id, current_user.user_id, data.pin)
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
        outlet_id=staff.outlet_id,
        role=staff.role.value,
    )
    refresh_token = create_refresh_token(
        user_id=staff.id,
        outlet_id=staff.outlet_id,
        role=staff.role.value,
    )

    staff.refresh_token_hash = hash_token(refresh_token)
    await db.flush()
    await db.refresh(staff)

    await create_staff_audit_log(
        db,
        outlet_id=staff.outlet_id,
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
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active outlet session required for PIN quick-switch",
        )

    staff = await authenticate_staff_pin(
        db, target_outlet_id, data.staff_id, data.pin
    )

    staff_context_token = create_access_token(
        user_id=staff.id,
        outlet_id=staff.outlet_id,
        role=staff.role.value,
    )

    await create_staff_audit_log(
        db,
        outlet_id=staff.outlet_id,
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
        .where(StaffAuditLog.outlet_id == current_user.outlet_id)
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
            outlet_id=r.outlet_id,
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


# ── Staff Incentives & Performance ──────────────────────────────────────


@router.get("/incentives/report")
async def get_staff_incentives_report(
    current_user: RequireAdmin,
    db: DBSession,
    start_date: str | None = Query(None, description="Format: YYYY-MM-DD"),
    end_date: str | None = Query(None, description="Format: YYYY-MM-DD"),
):
    """
    Store-wide staff incentive report for settled orders.
    Calculates total items assisted, sales volume generated, and estimated commission.
    """
    from app.models.enums import OrderStatusEnum
    from app.models.order import Order
    from app.models.order_item import OrderItem
    from app.models.user import User

    stmt = (
        select(
            OrderItem.added_by_staff_id,
            User.name.label("staff_name"),
            User.email.label("staff_email"),
            func.count(OrderItem.id).label("item_count"),
            func.sum(OrderItem.quantity).label("total_quantity"),
            func.sum(OrderItem.unit_price * OrderItem.quantity).label("total_sales"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .join(User, User.id == OrderItem.added_by_staff_id)
        .where(
            Order.outlet_id == current_user.outlet_id,
            Order.status == OrderStatusEnum.COMPLETED,
            OrderItem.added_by_staff_id.isnot(None),
        )
    )

    if start_date:
        try:
            dt_start = datetime.strptime(start_date, "%Y-%m-%d")
            stmt = stmt.where(Order.created_at >= dt_start)
        except ValueError:
            pass

    if end_date:
        try:
            dt_end = datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S")
            stmt = stmt.where(Order.created_at <= dt_end)
        except ValueError:
            pass

    stmt = stmt.group_by(OrderItem.added_by_staff_id, User.name, User.email)
    res = await db.execute(stmt)
    rows = res.all()

    report_items = []
    grand_total_sales = 0.0
    grand_total_items = 0

    for r in rows:
        sales = float(r.total_sales or 0.0)
        items_cnt = int(r.total_quantity or 0)
        est_incentive = round(sales * 0.05, 2)
        grand_total_sales += sales
        grand_total_items += items_cnt

        report_items.append({
            "staff_id": str(r.added_by_staff_id),
            "staff_name": r.staff_name or r.staff_email or "Staff",
            "assisted_items_count": items_cnt,
            "total_assisted_sales": sales,
            "estimated_incentive": est_incentive,
            "commission_rate": "5%",
        })

    return {
        "outlet_id": str(current_user.outlet_id),
        "start_date": start_date,
        "end_date": end_date,
        "grand_total_sales": grand_total_sales,
        "grand_total_items": grand_total_items,
        "staff_reports": report_items,
    }


@router.get("/incentives/my-performance")
async def get_my_incentive_performance(
    current_user: AuthenticatedUser,
    db: DBSession,
):
    """
    Get personal incentive performance metrics for the logged-in staff member.
    """
    from app.models.enums import OrderStatusEnum
    from app.models.order import Order
    from app.models.order_item import OrderItem

    staff_id = current_user.user_id
    if not staff_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User ID not found in current token.",
        )

    stmt = (
        select(
            func.count(OrderItem.id).label("item_count"),
            func.sum(OrderItem.quantity).label("total_quantity"),
            func.sum(OrderItem.unit_price * OrderItem.quantity).label("total_sales"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            OrderItem.added_by_staff_id == staff_id,
            Order.status == OrderStatusEnum.COMPLETED,
        )
    )

    res = await db.execute(stmt)
    row = res.one_or_none()

    total_sales = float(row.total_sales or 0.0) if row else 0.0
    items_count = int(row.total_quantity or 0) if row else 0
    est_incentive = round(total_sales * 0.05, 2)

    return {
        "staff_id": str(staff_id),
        "user_email": current_user.email,
        "role": current_user.role,
        "total_assisted_items": items_count,
        "total_assisted_sales": total_sales,
        "estimated_incentive": est_incentive,
        "commission_rate": "5%",
    }

