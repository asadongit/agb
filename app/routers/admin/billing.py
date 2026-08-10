"""
Billing FastAPI Router — manual bill creation, discount approval workflows, Cash/UPI settlement, and pending notification badge counts.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies import (
    AuthenticatedUser,
    CurrentUser,
    DBSession,
    RequireAdmin,
    require_permission,
)
from app.models.bill_discount_approval import BillDiscountApproval
from app.models.enums import RoleEnum
from app.models.order import Order
from app.models.user import User
from app.schemas.billing import (
    ApplyDiscountRequest,
    ApproveDiscountRequest,
    BillResponse,
    CreateManualBillRequest,
    DiscountApprovalResponse,
    MarkPaidRequest,
    UpdateManualBillRequest,
)
from app.services.billing_service import (
    apply_discount,
    approve_discount,
    create_manual_bill,
    finalize_bill,
    get_pending_approvals_count,
    mark_bill_paid,
    update_manual_bill,
)

router = APIRouter(prefix="/api/billing", tags=["billing"])


def _format_bill_response(order: Order) -> BillResponse:
    items_out = []
    for item in order.items:
        items_out.append(
            {
                "id": str(item.id),
                "menu_item_id": str(item.menu_item_id) if item.menu_item_id else None,
                "variant_id": str(item.variant_id) if item.variant_id else None,
                "item_name": item.item_name or "Item",
                "quantity": item.quantity,
                "unit_price": float(item.unit_price or 0.0),
                "is_complimentary": item.is_complimentary,
                "line_total": float(item.line_total or 0.0),
            }
        )

    return BillResponse(
        id=str(order.id),
        outlet_id=str(order.outlet_id),
        basket_number=order.basket_number,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        status=order.status.value if hasattr(order.status, "value") else str(order.status),
        source=order.source or "manual",
        subtotal_amount=float(order.subtotal_amount or order.total_amount or 0.0),
        total_amount=float(order.total_amount or 0.0),
        discount_type=order.discount_type,
        discount_value=float(order.discount_value) if order.discount_value is not None else None,
        discount_reason=order.discount_reason,
        discount_status=order.discount_status,
        payment_method=order.payment_method,
        created_by_staff_id=str(order.created_by_staff_id) if order.created_by_staff_id else None,
        created_at=order.created_at.isoformat() if hasattr(order.created_at, "isoformat") else str(order.created_at),
        finalized_at=order.finalized_at.isoformat() if order.finalized_at and hasattr(order.finalized_at, "isoformat") else None,
        paid_at=order.paid_at.isoformat() if order.paid_at and hasattr(order.paid_at, "isoformat") else None,
        items=items_out,
    )


@router.post("/bills", response_model=BillResponse)
async def create_bill_endpoint(
    data: CreateManualBillRequest,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Create a draft manual bill."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    order = await create_manual_bill(db, current_user.outlet_id, current_user, data)
    return _format_bill_response(order)


@router.put("/bills/{bill_id}", response_model=BillResponse)
async def update_bill_endpoint(
    bill_id: uuid.UUID,
    data: UpdateManualBillRequest,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Update line items or basket info on draft bill."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    order = await update_manual_bill(db, bill_id, current_user.outlet_id, data)
    return _format_bill_response(order)


@router.post("/bills/{bill_id}/apply-discount", response_model=BillResponse)
async def apply_discount_endpoint(
    bill_id: uuid.UUID,
    data: ApplyDiscountRequest,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Apply discount (% / flat / complimentary) with reason note."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    order = await apply_discount(db, bill_id, current_user.outlet_id, current_user, data)
    return _format_bill_response(order)


@router.post("/approvals/{approval_id}/resolve")
async def resolve_discount_approval_endpoint(
    approval_id: uuid.UUID,
    data: ApproveDiscountRequest,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Manager/Admin approves or rejects a pending discount request."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    approval = await approve_discount(db, approval_id, current_user.outlet_id, current_user, data.approve)
    return {"status": approval.status, "message": f"Discount approval {approval.status.lower()} successfully."}


@router.post("/bills/{bill_id}/finalize", response_model=BillResponse)
async def finalize_bill_endpoint(
    bill_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Lock draft bill from further item edits."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    order = await finalize_bill(db, bill_id, current_user.outlet_id)
    return _format_bill_response(order)


@router.post("/bills/{bill_id}/mark-paid", response_model=BillResponse)
async def mark_paid_endpoint(
    bill_id: uuid.UUID,
    data: MarkPaidRequest,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Record Cash or UPI payment and mark bill as paid."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    order = await mark_bill_paid(db, bill_id, current_user.outlet_id, data.payment_method)
    return _format_bill_response(order)


@router.get("/pending-approvals-count")
async def pending_approvals_count_endpoint(
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Get count of pending discount approval requests for manager badge."""
    if not current_user.outlet_id:
        return {"count": 0}
    cnt = await get_pending_approvals_count(db, current_user.outlet_id)
    return {"count": cnt}


@router.get("/pending-approvals", response_model=list[DiscountApprovalResponse])
async def list_pending_approvals_endpoint(
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """List pending discount approvals for manager action panel."""
    if not current_user.outlet_id:
        return []

    stmt = (
        select(BillDiscountApproval)
        .join(Order, BillDiscountApproval.order_id == Order.id)
        .options(selectinload(BillDiscountApproval.order), selectinload(BillDiscountApproval.requested_by))
        .where(
            Order.outlet_id == current_user.outlet_id,
            BillDiscountApproval.status == "PENDING",
        )
        .order_by(BillDiscountApproval.created_at.desc())
    )
    res = await db.execute(stmt)
    approvals = res.scalars().all()

    out = []
    for appr in approvals:
        out.append(
            DiscountApprovalResponse(
                id=str(appr.id),
                order_id=str(appr.order_id),
                requested_by_id=str(appr.requested_by_id),
                requested_by_name=appr.requested_by.email if appr.requested_by else None,
                approved_by_id=str(appr.approved_by_id) if appr.approved_by_id else None,
                status=appr.status,
                discount_type=appr.discount_type,
                discount_value=float(appr.discount_value or 0.0),
                reason_note=appr.reason_note,
                created_at=appr.created_at.isoformat() if hasattr(appr.created_at, "isoformat") else str(appr.created_at),
                order_basket_number=appr.order.basket_number if appr.order else "N/A",
                order_total_amount=float(appr.order.total_amount if appr.order else 0.0),
            )
        )
    return out


@router.get("/bills", response_model=list[BillResponse])
async def list_bills_endpoint(
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
    status: str | None = Query(None),
    source: str | None = Query(None),
):
    """List bills with optional status and source filtering."""
    if not current_user.outlet_id:
        return []

    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.outlet_id == current_user.outlet_id)
    )

    if source:
        stmt = stmt.where(Order.source == source)
    if status:
        stmt = stmt.where(Order.status == status)

    stmt = stmt.order_by(Order.created_at.desc()).limit(100)
    res = await db.execute(stmt)
    orders = res.scalars().all()

    return [_format_bill_response(o) for o in orders]


@router.get("/bills/{bill_id}", response_model=BillResponse)
async def get_bill_endpoint(
    bill_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Fetch single bill by ID."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    res = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.id == bill_id,
            Order.outlet_id == current_user.outlet_id,
        )
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Bill not found.")

    return _format_bill_response(order)
