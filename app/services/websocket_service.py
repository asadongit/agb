"""
WebSocket service — connection manager + Redis pub/sub fan-out.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections import defaultdict

from fastapi import WebSocket

from app.core.redis import get_redis


class ConnectionManager:
    """
    Manages WebSocket connections per restaurant.
    Uses Redis pub/sub for multi-instance fan-out — in-memory dicts only
    track connections on the current instance.
    """

    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, list[WebSocket]] = defaultdict(list)
        self._subscriber_tasks: dict[uuid.UUID, asyncio.Task] = {}

    async def connect(
        self, websocket: WebSocket, restaurant_id: uuid.UUID
    ) -> None:
        """Accept connection and subscribe to Redis channel."""
        await websocket.accept()
        self._connections[restaurant_id].append(websocket)

        # Start Redis subscriber for this restaurant if not already running
        if restaurant_id not in self._subscriber_tasks:
            task = asyncio.create_task(
                self._redis_subscriber(restaurant_id)
            )
            self._subscriber_tasks[restaurant_id] = task

    async def disconnect(
        self, websocket: WebSocket, restaurant_id: uuid.UUID
    ) -> None:
        """Remove connection. Stop subscriber if no connections remain."""
        if websocket in self._connections[restaurant_id]:
            self._connections[restaurant_id].remove(websocket)

        # Clean up if no more connections for this restaurant
        if not self._connections[restaurant_id]:
            del self._connections[restaurant_id]
            task = self._subscriber_tasks.pop(restaurant_id, None)
            if task:
                task.cancel()

    async def broadcast_to_restaurant(
        self,
        restaurant_id: uuid.UUID,
        event_type: str,
        data: dict,
    ) -> None:
        """
        Publish event via Redis pub/sub — reaches all app instances.
        Each instance's subscriber will forward to its local connections.
        """
        r = await get_redis()
        message = json.dumps({
            "event": event_type,
            "data": data,
        }, default=str)
        await r.publish(f"kitchen:{restaurant_id}", message)

    async def _redis_subscriber(self, restaurant_id: uuid.UUID) -> None:
        """
        Subscribe to Redis channel and forward messages to local WebSocket
        connections. Runs as a background task per restaurant.
        """
        r = await get_redis()
        pubsub = r.pubsub()
        channel = f"kitchen:{restaurant_id}"

        try:
            await pubsub.subscribe(channel)

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                # Forward to all local connections for this restaurant
                data = message["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8")

                dead_connections: list[WebSocket] = []
                for ws in self._connections.get(restaurant_id, []):
                    try:
                        await ws.send_text(data)
                    except Exception:
                        dead_connections.append(ws)

                # Clean up dead connections
                for ws in dead_connections:
                    await self.disconnect(ws, restaurant_id)

        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    async def _send_local(
        self, restaurant_id: uuid.UUID, message: str
    ) -> None:
        """Send to all locally-connected WebSockets for a restaurant."""
        dead: list[WebSocket] = []
        for ws in self._connections.get(restaurant_id, []):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws, restaurant_id)


# Singleton — shared across the app
ws_manager = ConnectionManager()


# ── Convenience broadcast functions ──────────────────────────────────────


async def broadcast_new_order_paid(
    restaurant_id: uuid.UUID, order_id: uuid.UUID
) -> None:
    """Broadcast NEW_ORDER_PAID event to kitchen dashboard."""
    await ws_manager.broadcast_to_restaurant(
        restaurant_id,
        "NEW_ORDER_PAID",
        {"order_id": str(order_id)},
    )


async def broadcast_verification_needed(
    restaurant_id: uuid.UUID, order_id: uuid.UUID, table_number: str
) -> None:
    """Broadcast VERIFICATION_NEEDED for Mode B 'I have paid' click."""
    await ws_manager.broadcast_to_restaurant(
        restaurant_id,
        "VERIFICATION_NEEDED",
        {"order_id": str(order_id), "table_number": table_number},
    )


async def broadcast_order_status_changed(
    restaurant_id: uuid.UUID,
    order_id: uuid.UUID,
    old_status: str,
    new_status: str,
) -> None:
    """Broadcast ORDER_STATUS_CHANGED on any state transition."""
    await ws_manager.broadcast_to_restaurant(
        restaurant_id,
        "ORDER_STATUS_CHANGED",
        {
            "order_id": str(order_id),
            "old_status": old_status,
            "new_status": new_status,
        },
    )
