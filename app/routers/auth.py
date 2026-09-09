import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import AuthenticatedUser, DBSession, RequireSuperadmin
from app.models.enums import RoleEnum
from app.models.user import User
from app.schemas.auth import (LoginRequest, RefreshRequest, RegisterRequest, TokenResponse)
from app.schemas.common import MessageResponse
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """
    Register a new admin user — protected endpoint for Superadmin.
    """
    if data.role != RoleEnum.SUPERADMIN and not data.outlet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="outlet_id is required when creating an outlet admin account",
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
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """
    Delete an admin user account — protected endpoint for Superadmin.
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

    await db.delete(target_user)
    await db.flush()

@router.post("/impersonate/{outlet_id}", response_model=TokenResponse)
async def impersonate_outlet(
    outlet_id: uuid.UUID,
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """
    Generate a new access token that acts as SUPERADMIN but scoped to a specific outlet_id.
    """
    from app.models.outlet import Outlet
    from app.core.security import create_access_token, create_refresh_token
    
    result = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
    outlet = result.scalar_one_or_none()
    
    if not outlet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Outlet not found",
        )

    access_token = create_access_token(
        user_id=current_user.user_id,
        outlet_id=outlet_id,
        role=RoleEnum.SUPERADMIN.value,
    )
    refresh_token = create_refresh_token(
        user_id=current_user.user_id,
        outlet_id=outlet_id,
        role=RoleEnum.SUPERADMIN.value,
    )

    user_res = await db.execute(select(User).where(User.id == current_user.user_id))
    user_obj = user_res.scalar_one()

    from app.services.staff_service import to_staff_response
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        role=RoleEnum.SUPERADMIN.value,
        user=to_staff_response(user_obj)
    )
