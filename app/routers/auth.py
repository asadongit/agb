import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import AuthenticatedUser, DBSession, RequireAdmin
from app.models.enums import RoleEnum
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.common import MessageResponse
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    data: RegisterRequest,
    current_user: RequireAdmin,
    db: DBSession,
):
    """
    Register a new user — protected endpoint for Superadmin and Outlet Admin.
    - Superadmin can create STAFF or OUTLET_ADMIN accounts for any outlet.
    - Outlet Admin can only create STAFF accounts for their own outlet.
    """
    if current_user.role == RoleEnum.OUTLET_ADMIN:
        if data.role == RoleEnum.SUPERADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Outlet admins cannot create superadmin accounts",
            )
        data.outlet_id = current_user.outlet_id
    elif current_user.role == RoleEnum.SUPERADMIN:
        if not data.outlet_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="outlet_id is required for superadmin user creation",
            )

    await auth_service.register_user(db, data)
    return MessageResponse(message="User registered successfully")


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: DBSession):
    """Authenticate and receive access + refresh tokens."""
    return await auth_service.login_user(db, data)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: DBSession):
    """Rotate refresh token and get new access + refresh tokens."""
    return await auth_service.refresh_tokens(db, data.refresh_token)


@router.post("/logout", response_model=MessageResponse)
async def logout(current_user: AuthenticatedUser, db: DBSession):
    """Revoke refresh token."""
    await auth_service.logout_user(db, current_user.user_id)
    return MessageResponse(message="Logged out successfully")


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """
    Delete a user account.
    - Superadmin can delete any admin or staff user.
    - Outlet Admin can only delete staff users belonging to their outlet.
    """
    if current_user.user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own active account",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found",
        )

    if current_user.role == RoleEnum.OUTLET_ADMIN:
        if target_user.outlet_id != current_user.outlet_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot delete users from another outlet",
            )
        if target_user.role == RoleEnum.SUPERADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Outlet admins cannot delete superadmin accounts",
            )

    await db.delete(target_user)
    await db.flush()
