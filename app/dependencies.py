"""
Shared FastAPI dependencies — DB sessions, auth, tenant scoping.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.database import get_async_session
from app.models.enums import RoleEnum
from app.models.user import User

# ── Reusable type aliases ────────────────────────────────────────────────

DBSession = Annotated[AsyncSession, Depends(get_async_session)]

_bearer_scheme = HTTPBearer(auto_error=True)


# ── Auth dependencies ────────────────────────────────────────────────────


class CurrentUser:
    """Decoded JWT payload — NOT a DB-fetched User, just the claims."""

    def __init__(self, user_id: uuid.UUID, outlet_id: uuid.UUID | None, role: RoleEnum):
        self.user_id = user_id
        self.outlet_id = outlet_id
        self.role = role


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer_scheme)],
) -> CurrentUser:
    """
    Decode the JWT from the Authorization header.
    Extracts user_id, outlet_id (optional for SUPERADMIN), and role from claims.
    """
    token = credentials.credentials
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type — expected access token",
        )

    try:
        raw_outlet_id = payload.get("outlet_id")
        return CurrentUser(
            user_id=uuid.UUID(payload["sub"]),
            outlet_id=uuid.UUID(raw_outlet_id) if raw_outlet_id else None,
            role=RoleEnum(payload["role"]),
        )
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token payload",
        )


AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]


# ── Role-based dependencies ─────────────────────────────────────────────


def require_role(*allowed_roles: RoleEnum):
    """
    Factory that returns a dependency checking if the user has one of the
    allowed roles. Usage: Depends(require_role(RoleEnum.OUTLET_ADMIN))
    """

    async def _check(current_user: AuthenticatedUser) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires one of: {[r.value for r in allowed_roles]}",
            )
        return current_user

    return _check


RequireAdmin = Annotated[
    CurrentUser,
    Depends(require_role(RoleEnum.SUPERADMIN, RoleEnum.OUTLET_ADMIN, RoleEnum.MANAGER)),
]
RequireSuperadmin = Annotated[
    CurrentUser, Depends(require_role(RoleEnum.SUPERADMIN))
]
RequireStaffOrAdmin = Annotated[
    CurrentUser,
    Depends(
        require_role(
            RoleEnum.SUPERADMIN,
            RoleEnum.OUTLET_ADMIN,
            RoleEnum.MANAGER,
            RoleEnum.FLOOR_STAFF,
            RoleEnum.CASHIER,
            RoleEnum.WAITER,
            RoleEnum.STAFF,
        )
    ),
]


def require_permission(perm_name: str):
    """Factory dependency checking permission flag on CurrentUser's role."""

    async def _check(current_user: AuthenticatedUser) -> CurrentUser:
        from app.services.staff_service import get_permissions_for_role

        perms = get_permissions_for_role(current_user.role)
        if not getattr(perms, perm_name, False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role.value}' lacks permission '{perm_name}'",
            )
        return current_user

    return _check


# ── Tenant scoping ──────────────────────────────────────────────────────


def tenant_scoped_query(
    stmt: Select,
    model: type,
    tenant_id: uuid.UUID | None,
    current_user: CurrentUser | None = None,
) -> Select:
    """
    Append tenant scoping to query (.where(model.outlet_id == tenant_id)).
    If current_user is a SUPERADMIN and no specific tenant_id is provided, bypass tenant scoping!
    """
    if current_user and current_user.role == RoleEnum.SUPERADMIN and tenant_id is None:
        return stmt
    if tenant_id is not None:
        col = getattr(model, "outlet_id", None)
        if col is not None:
            return stmt.where(col == tenant_id)
    return stmt


# Backward-compatible alias
outlet_scoped_query = tenant_scoped_query
