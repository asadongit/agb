"""
Auth service — registration, login, token refresh, logout.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.staff import Staff
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse


async def register_user(
    db: AsyncSession,
    data: RegisterRequest,
) -> User:
    """Register a new user (default role: OUTLET_ADMIN if first, else STAFF)."""
    # Check if email is taken
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User with email '{data.email}' already exists",
        )

    user = User(
        id=uuid.uuid4(),
        email=data.email,
        password_hash=hash_password(data.password),
        outlet_id=data.outlet_id,
        role=data.role,
    )
    db.add(user)
    await db.flush()
    return user


async def login_user(
    db: AsyncSession,
    data: LoginRequest,
) -> TokenResponse:
    """Authenticate user with email and password, issue tokens."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
        )

    access_token = create_access_token(
        user_id=user.id,
        outlet_id=user.outlet_id,
        role=user.role.value,
    )
    refresh_token = create_refresh_token(
        user_id=user.id,
        outlet_id=user.outlet_id,
        role=user.role.value,
    )

    # Store refresh token hash
    user.refresh_token_hash = hash_token(refresh_token)
    await db.flush()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        role=user.role.value,
    )


async def refresh_tokens(
    db: AsyncSession,
    refresh_token: str,
) -> TokenResponse:
    """
    Rotate refresh token — issue new access + refresh, invalidate the old one.
    Handles both User and Staff accounts gracefully.
    """
    try:
        payload = decode_token(refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type — expected refresh token",
        )

    user_id = uuid.UUID(payload["sub"])
    role_val = payload.get("role")
    raw_outlet_id = payload.get("outlet_id")
    outlet_id = uuid.UUID(raw_outlet_id) if raw_outlet_id else None

    # Check User table first, then Staff table
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    staff = None
    if not user:
        result_staff = await db.execute(select(Staff).where(Staff.id == user_id))
        staff = result_staff.scalar_one_or_none()

    if not user and not staff:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    if user and not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    if staff and staff.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Staff account is inactive",
        )

    target_role = user.role.value if user else (staff.role.value if staff else role_val)
    target_outlet_id = user.outlet_id if user else (staff.outlet_id if staff else outlet_id)

    # Issue new tokens
    new_access = create_access_token(
        user_id=user_id,
        outlet_id=target_outlet_id,
        role=target_role,
    )
    new_refresh = create_refresh_token(
        user_id=user_id,
        outlet_id=target_outlet_id,
        role=target_role,
    )

    if user:
        user.refresh_token_hash = hash_token(new_refresh)
        await db.flush()

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        role=target_role,
    )


async def logout_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> None:
    """Revoke refresh token on logout."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        user.refresh_token_hash = None
        await db.flush()
