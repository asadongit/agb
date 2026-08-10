"""
WebSocket dashboard route.
Auth via short-lived ticket — JWTs must NEVER be passed as query params.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jose import JWTError

from app.core.security import create_ws_ticket, decode_token
from app.dependencies import AuthenticatedUser
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
        outlet_id=current_user.outlet_id,
        ttl_seconds=60,
    )
    return {"ticket": ticket}


async def _handle_ws_connection(websocket: WebSocket, target_id: uuid.UUID):
    ticket = websocket.query_params.get("ticket")
    if not ticket:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_token(ticket)
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if payload.get("type") != "ws_ticket":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    raw_tid = payload.get("outlet_id")
    if not raw_tid or uuid.UUID(raw_tid) != target_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws_manager.connect(websocket, target_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except (WebSocketDisconnect, Exception):
        await ws_manager.disconnect(websocket, target_id)


@router.websocket("/ws/mart/{outlet_id}")
async def mart_websocket(websocket: WebSocket, outlet_id: uuid.UUID):
    """WebSocket endpoint for mart & grocery dashboard."""
    await _handle_ws_connection(websocket, outlet_id)
