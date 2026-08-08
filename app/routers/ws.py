"""
WebSocket kitchen dashboard route.
Auth via short-lived ticket — JWTs must NEVER be passed as query params.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jose import JWTError

from app.core.security import create_ws_ticket, decode_token
from app.dependencies import AuthenticatedUser, DBSession
from app.services.websocket_service import ws_manager

router = APIRouter(tags=["websocket"])


@router.post("/api/ws-ticket")
async def get_ws_ticket(current_user: AuthenticatedUser):
    """
    Issue a short-lived, single-use WebSocket ticket.
    The ticket is an opaque token with 60s TTL.
    Pass this in the WS query string instead of the JWT.
    """
    ticket = create_ws_ticket(
        user_id=current_user.user_id,
        restaurant_id=current_user.restaurant_id,
        ttl_seconds=60,
    )
    return {"ticket": ticket}


@router.websocket("/ws/kitchen/{restaurant_id}")
async def kitchen_websocket(
    websocket: WebSocket,
    restaurant_id: uuid.UUID,
):
    """
    WebSocket endpoint for kitchen dashboard.
    Authenticates via ticket query param (NOT a JWT).
    Subscribes to Redis pub/sub for real-time event fan-out.
    """
    # Extract ticket from query params
    ticket = websocket.query_params.get("ticket")
    if not ticket:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Validate ticket
    try:
        payload = decode_token(ticket)
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if payload.get("type") != "ws_ticket":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Verify the ticket's restaurant_id matches the path param
    ticket_restaurant_id = uuid.UUID(payload["restaurant_id"])
    if ticket_restaurant_id != restaurant_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Accept and manage connection
    await ws_manager.connect(websocket, restaurant_id)

    try:
        # Keep connection alive — listen for client messages (ping/pong)
        while True:
            data = await websocket.receive_text()
            # Clients can send "ping" to keep alive
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, restaurant_id)
    except Exception:
        await ws_manager.disconnect(websocket, restaurant_id)
