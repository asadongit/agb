"""
Public menu route — no auth required.
Serves the cached menu JSON tree for an outlet by slug.
Rate-limited to prevent abuse.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.core.rate_limit import limiter
from app.dependencies import DBSession
from app.services.menu_service import get_public_menu, get_public_outlets

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/outlets")
@limiter.limit("60/minute")
async def list_outlets(
    request: Request,
    db: DBSession,
):
    """Public list of active outlets for the welcome selector screen."""
    return await get_public_outlets(db)


@router.get("/menu/{outlet_slug}")
@limiter.limit("60/minute")
async def get_menu(
    outlet_slug: str,
    request: Request,
    db: DBSession,
):
    """
    Public menu endpoint — no auth required.
    Uses Redis cache-aside with jittered 24h TTL and thundering-herd protection.
    """
    return await get_public_menu(db, outlet_slug)
