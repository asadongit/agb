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
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse

async def register_user(
    db: AsyncSession,
    data: RegisterRequest,
) -> User:
    """
    Create a new user. Restaurant must already exist.
    Password is hashed with argon2id.
    """
    # Check for duplicate email
    existing = await db.execute(
        select(User).where(User.email == data.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    user = User(
        id=uuid.uuid4(),
        restaurant_id=data.restaurant_id,
        role=data.role,
        email=data.email,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    await db.flush()
    return user


async def login_user(
    db: AsyncSession,
    data: LoginRequest,
) -> TokenResponse:
    """Authenticate user and return access + refresh tokens."""
    result = await db.execute(
        select(User).where(User.email == data.email)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    access_token = create_access_token(
        user_id=user.id,
        restaurant_id=user.restaurant_id,
        role=user.role.value,
    )
    refresh_token = create_refresh_token(
        user_id=user.id,
        restaurant_id=user.restaurant_id,
        role=user.role.value,
    )

    # Store hashed refresh token for rotation/revocation
    user.refresh_token_hash = hash_token(refresh_token)
    await db.flush()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


async def refresh_tokens(
    db: AsyncSession,
    refresh_token: str,
) -> TokenResponse:
    """
    Rotate refresh token — issue new access + refresh, invalidate the old one.
    If the old token doesn't match, revoke all tokens (possible replay attack).
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
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    # Verify the refresh token hash matches (rotation check)
    if user.refresh_token_hash != hash_token(refresh_token):
        # Possible token reuse — revoke all tokens for this user
        user.refresh_token_hash = None
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked — please log in again",
        )

    # Issue new tokens
    new_access = create_access_token(
        user_id=user.id,
        restaurant_id=user.restaurant_id,
        role=user.role.value,
    )
    new_refresh = create_refresh_token(
        user_id=user.id,
        restaurant_id=user.restaurant_id,
        role=user.role.value,
    )

    # Rotate: store new hash, invalidate old
    user.refresh_token_hash = hash_token(new_refresh)
    await db.flush()

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
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
