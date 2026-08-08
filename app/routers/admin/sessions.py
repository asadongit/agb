"""
Admin session routes — list active sessions, manage abandoned carts,
terminate sessions. All tenant-scoped via JWT.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.dependencies import (
    DBSession,
    RequireAdmin,
    RequireStaffOrAdmin,
    tenant_scoped_query,
)
from app.models.abandoned_cart import AbandonedCart
from app.models.enums import SessionStatusEnum
from app.models.order import Order
from app.models.table_session import TableSession
from app.models.user import User
from app.schemas.common import StrictSchema
from app.schemas.session import AbandonedCartResponse
from app.services.audit_service import log_action
from app.services.session_service import terminate_session

router = APIRouter(prefix="/api/admin/sessions", tags=["admin-sessions"])


# ── Schemas ──────────────────────────────────────────────────────────────


class ActiveSessionResponse(StrictSchema):
    id: str
    table_number: str
    customer_name: str
    customer_phone: str | None = None
    status: str
    expires_at: str
    created_at: str
    order_count: int = 0


class TerminateSessionRequest(StrictSchema):
    reason: str | None = Field(None, max_length=500)


# ── Routes ───────────────────────────────────────────────────────────────


@router.get("", response_model=list[ActiveSessionResponse])
async def list_active_sessions(
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """List all active basket sessions for this outlet."""
    stmt = (
        select(TableSession)
        .where(
            TableSession.restaurant_id == current_user.restaurant_id,
            TableSession.status == SessionStatusEnum.ACTIVE,
        )
        .options(
            selectinload(TableSession.orders),
            selectinload(TableSession.customer),
        )
        .order_by(TableSession.created_at.desc())
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    return [
        ActiveSessionResponse(
            id=str(s.id),
            table_number=s.table_number,
            customer_name=s.customer_name,
            customer_phone=s.customer.phone if s.customer_id else None,
            status=s.status.value,
            expires_at=s.expires_at.isoformat(),
            created_at=s.created_at.isoformat(),
            order_count=len(s.orders),
        )
        for s in sessions
    ]


@router.post("/{session_id}/terminate", status_code=status.HTTP_200_OK)
async def terminate_session_endpoint(
    session_id: uuid.UUID,
    data: TerminateSessionRequest,
    current_user: RequireAdmin,  # Manager+ only
    db: DBSession,
):
    """
    Manually terminate an active basket session.
    Manager role and above only. Logs who terminated and when.
    """
    # Verify session belongs to this outlet
    stmt = select(TableSession).where(
        TableSession.id == session_id,
        TableSession.restaurant_id == current_user.restaurant_id,
        TableSession.status == SessionStatusEnum.ACTIVE,
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active session not found in this outlet",
        )

    terminated = await terminate_session(
        db=db,
        session_id=session_id,
        terminated_by_id=current_user.user_id,
        reason=data.reason,
    )

    from app.services.websocket_service import broadcast_session_changed
    await broadcast_session_changed(session.restaurant_id, session_id, "TERMINATED")

    await log_action(
        db,
        current_user.restaurant_id,
        current_user.user_id,
        "TERMINATE",
        "TableSession",
        str(session_id),
        details={
            "customer_name": terminated.customer_name,
            "table_number": terminated.table_number,
            "reason": data.reason,
        },
    )

    return {
        "status": "terminated",
        "session_id": str(session_id),
        "customer_name": terminated.customer_name,
    }


# ── Abandoned carts ─────────────────────────────────────────────────────


@router.get("/abandoned-carts", response_model=list[AbandonedCartResponse])
async def list_abandoned_carts(
    current_user: RequireStaffOrAdmin,
    db: DBSession,
    status_filter: str | None = None,
):
    """List abandoned carts for this outlet, most recent first."""
    stmt = (
        select(AbandonedCart)
        .where(AbandonedCart.restaurant_id == current_user.restaurant_id)
        .order_by(AbandonedCart.created_at.desc())
        .limit(100)
    )
    if status_filter:
        stmt = stmt.where(AbandonedCart.status == status_filter.upper())

    result = await db.execute(stmt)
    carts = result.scalars().all()

    return [
        AbandonedCartResponse(
            id=str(c.id),
            restaurant_id=str(c.restaurant_id),
            session_id=str(c.session_id),
            table_number=c.table_number,
            customer_name=c.customer_name,
            customer_phone=c.customer_phone,
            items=c.items or [],
            total_estimate=float(c.total_estimate),
            status=c.status,
            converted_order_id=str(c.converted_order_id) if c.converted_order_id else None,
            created_at=c.created_at.isoformat(),
        )
        for c in carts
    ]


@router.get("/abandoned-carts/count")
async def abandoned_cart_count(
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """Count of un-converted abandoned carts (for dashboard badge)."""
    stmt = (
        select(func.count())
        .select_from(AbandonedCart)
        .where(
            AbandonedCart.restaurant_id == current_user.restaurant_id,
            AbandonedCart.status == "ABANDONED",
        )
    )
    result = await db.execute(stmt)
    count = result.scalar_one()
    return {"count": count}


@router.post("/abandoned-carts/{cart_id}/convert", status_code=status.HTTP_200_OK)
async def convert_abandoned_cart(
    cart_id: uuid.UUID,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """
    Convert an abandoned cart into a manual bill via the existing
    billing service. Pre-fills items from the cart snapshot.
    """
    # Load the abandoned cart
    stmt = select(AbandonedCart).where(
        AbandonedCart.id == cart_id,
        AbandonedCart.restaurant_id == current_user.restaurant_id,
    )
    result = await db.execute(stmt)
    cart = result.scalar_one_or_none()
    if not cart:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Abandoned cart not found",
        )
    if cart.status == "CONVERTED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This cart has already been converted to a bill",
        )

    # Use the existing billing service to create a manual bill
    from app.services.billing_service import create_manual_bill
    from app.schemas.billing import BillItemInput, CreateManualBillRequest

    bill_items = []
    for item in (cart.items or []):
        bill_items.append(BillItemInput(
            menu_item_id=item.get("menu_item_id"),
            variant_id=item.get("variant_id"),
            quantity=Decimal(str(item.get("quantity", 1))),
        ))

    bill_request = CreateManualBillRequest(
        table_number=cart.table_number,
        customer_name=cart.customer_name,
        customer_phone=cart.customer_phone,
        items=bill_items,
    )

    # Load actual User object for billing service
    user_result = await db.execute(
        select(User).where(User.id == current_user.user_id)
    )
    staff_user = user_result.scalar_one_or_none()
    if not staff_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff user not found",
        )

    order = await create_manual_bill(
        db=db,
        restaurant_id=current_user.restaurant_id,
        staff_user=staff_user,
        data=bill_request,
    )

    # Mark cart as converted
    cart.status = "CONVERTED"
    cart.converted_order_id = order.id
    await db.flush()

    await log_action(
        db,
        current_user.restaurant_id,
        current_user.user_id,
        "CONVERT",
        "AbandonedCart",
        str(cart_id),
        details={
            "converted_order_id": str(order.id),
            "customer_name": cart.customer_name,
        },
    )

    return {
        "status": "converted",
        "abandoned_cart_id": str(cart_id),
        "order_id": str(order.id),
    }
