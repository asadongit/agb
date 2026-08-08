"""
Session public routes — start/resume sessions, extend, abandon cart,
get status, customer history.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, status

from app.dependencies import DBSession
from app.schemas.session import (
    AbandonCartRequest,
    AbandonedCartResponse,
    CustomerHistoryResponse,
    ExtendSessionResponse,
    ResumeSessionRequest,
    SessionStatusResponse,
    StartSessionRequest,
    StartSessionResponse,
)
from app.schemas.order import OrderResponse
from app.services.session_service import (
    extend_session,
    expire_session,
    get_customer_history,
    get_session_with_orders,
    save_abandoned_cart,
    start_or_resume_session,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("/start", response_model=StartSessionResponse, status_code=status.HTTP_200_OK)
async def start_session(
    data: StartSessionRequest,
    db: DBSession,
):
    """
    Start a new basket session or resume an existing one.

    - Same name scanning the same basket mid-session → resumes existing session.
    - Different name scanning a basket with an active session → 409 blocked.
    - If a phone number is provided, links/creates a Customer record.
    """
    result = await start_or_resume_session(
        db=db,
        restaurant_slug=data.restaurant_slug,
        table_number=data.table_number,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
    )

    session = result["session"]
    active_orders = result["active_orders"]

    from app.services.websocket_service import broadcast_session_changed
    await broadcast_session_changed(session.restaurant_id, session.id, "CREATED")

    return StartSessionResponse(
        session_id=session.id,
        customer_name=session.customer_name,
        table_number=session.table_number,
        is_returning=result["is_returning"],
        active_orders=[OrderResponse.model_validate(o) for o in active_orders],
        expires_at=session.expires_at,
        session_duration_minutes=result["session_duration_minutes"],
    )


@router.post("/lookup", response_model=StartSessionResponse, status_code=status.HTTP_200_OK)
async def lookup_session(
    data: ResumeSessionRequest,
    db: DBSession,
):
    """
    Look up and resume an active session by name + basket.
    Same as /start but without the phone field — purely for re-scan flows.
    """
    result = await start_or_resume_session(
        db=db,
        restaurant_slug=data.restaurant_slug,
        table_number=data.table_number,
        customer_name=data.customer_name,
    )

    session = result["session"]
    active_orders = result["active_orders"]

    return StartSessionResponse(
        session_id=session.id,
        customer_name=session.customer_name,
        table_number=session.table_number,
        is_returning=result["is_returning"],
        active_orders=[OrderResponse.model_validate(o) for o in active_orders],
        expires_at=session.expires_at,
        session_duration_minutes=result["session_duration_minutes"],
    )


@router.get("/{session_id}", response_model=SessionStatusResponse)
async def get_session_status(
    session_id: uuid.UUID,
    db: DBSession,
):
    """Get session status with all its orders."""
    session, duration_minutes = await get_session_with_orders(db, session_id)

    return SessionStatusResponse(
        session_id=session.id,
        customer_name=session.customer_name,
        table_number=session.table_number,
        is_active=session.is_active,
        status=session.status.value,
        expires_at=session.expires_at,
        session_duration_minutes=duration_minutes,
        orders=[OrderResponse.model_validate(o) for o in session.orders],
    )


@router.get("/{session_id}/orders", response_model=list[OrderResponse])
async def get_session_orders(
    session_id: uuid.UUID,
    db: DBSession,
):
    """Get all orders for a session."""
    session, _ = await get_session_with_orders(db, session_id)
    return [OrderResponse.model_validate(o) for o in session.orders]


@router.post("/{session_id}/extend", response_model=ExtendSessionResponse)
async def extend_session_endpoint(
    session_id: uuid.UUID,
    db: DBSession,
):
    """
    Extend a customer's active session by the outlet's configured duration.
    No auth required — session ID acts as the token.
    No cap on number of extensions.
    """
    session = await extend_session(db, session_id)

    # Look up duration for response
    from app.models.restaurant import Restaurant
    from sqlalchemy import select as sa_select
    rest_result = await db.execute(
        sa_select(Restaurant.session_duration_minutes)
        .where(Restaurant.id == session.restaurant_id)
    )
    duration = rest_result.scalar_one_or_none() or 30

    return ExtendSessionResponse(
        session_id=session.id,
        expires_at=session.expires_at,
        session_duration_minutes=duration,
    )


@router.post("/{session_id}/abandon-cart", status_code=status.HTTP_200_OK)
async def abandon_cart_endpoint(
    session_id: uuid.UUID,
    data: AbandonCartRequest,
    db: DBSession,
):
    """
    Frontend pushes local cart on session expiry/termination.
    Single fire-and-forget push — stores as abandoned cart record.
    Also marks session as expired if still active.
    """
    # Save the abandoned cart snapshot
    items_dicts = [item.model_dump(mode="json") for item in data.items]
    cart = await save_abandoned_cart(
        db=db,
        session_id=session_id,
        items=items_dicts,
        total_estimate=data.total_estimate,
    )

    # Also expire the session if it's still active
    await expire_session(db, session_id)

    return {
        "status": "ok",
        "abandoned_cart_id": str(cart.id) if cart else None,
    }


@router.get("/customer/history", response_model=CustomerHistoryResponse)
async def customer_history(
    phone: str = Query(min_length=1, max_length=20),
    restaurant_slug: str = Query(min_length=1),
    days: int = Query(default=30, ge=1, le=365),
    db: DBSession = None,
):
    """Get past order history for a customer identified by phone number."""
    result = await get_customer_history(
        db=db,
        restaurant_slug=restaurant_slug,
        phone=phone,
        days=days,
    )

    return CustomerHistoryResponse(
        customer_name=result["customer_name"],
        customer_phone=result["customer_phone"],
        past_orders=[OrderResponse.model_validate(o) for o in result["past_orders"]],
    )
