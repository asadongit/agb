"""
Restaurant admin routes — CRUD for the Restaurant entity.
Superadmin can create restaurants; Restaurant admins manage their own.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.dependencies import DBSession, RequireAdmin, RequireSuperadmin
from app.models.audit_log import AuditLog
from app.models.enums import RoleEnum
from app.models.restaurant import Restaurant
from app.models.user import User
from app.schemas.restaurant import (
    RestaurantCreate,
    RestaurantResponse,
    RestaurantUpdate,
    RestaurantWithUsersResponse,
)
from app.services.audit_service import log_action

router = APIRouter(prefix="/api/admin/restaurants", tags=["admin-restaurants"])


@router.get("", response_model=list[RestaurantWithUsersResponse])
async def list_all_restaurants(
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """List all onboarded restaurants with their associated admin and staff users (superadmin only)."""
    stmt = (
        select(Restaurant)
        .options(selectinload(Restaurant.users))
        .order_by(Restaurant.created_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "",
    response_model=RestaurantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_restaurant(
    data: RestaurantCreate,
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """Create a new restaurant (superadmin only)."""
    # Check slug uniqueness
    existing = await db.execute(
        select(Restaurant).where(Restaurant.slug == data.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Restaurant with slug '{data.slug}' already exists",
        )

    restaurant = Restaurant(
        id=uuid.uuid4(),
        **data.model_dump(),
    )
    db.add(restaurant)
    await db.flush()
    await db.refresh(restaurant)

    await log_action(
        db, restaurant.id, current_user.user_id,
        "CREATE", "Restaurant", str(restaurant.id),
        details=data.model_dump(mode="json"),
    )

    return restaurant


@router.get("/me", response_model=RestaurantResponse)
async def get_my_restaurant(
    current_user: RequireAdmin,
    db: DBSession,
):
    """Get the current user's restaurant details."""
    result = await db.execute(
        select(Restaurant).where(Restaurant.id == current_user.restaurant_id)
    )
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found",
        )
    return restaurant


@router.patch("/me", response_model=RestaurantResponse)
async def update_my_restaurant(
    data: RestaurantUpdate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update the current user's restaurant (admin only)."""
    result = await db.execute(
        select(Restaurant).where(Restaurant.id == current_user.restaurant_id)
    )
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found",
        )

    update_data = data.model_dump(exclude_unset=True)

    # Check slug uniqueness if slug is being changed
    if "slug" in update_data and update_data["slug"] != restaurant.slug:
        existing = await db.execute(
            select(Restaurant).where(Restaurant.slug == update_data["slug"])
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Restaurant with slug '{update_data['slug']}' already exists",
            )

    for key, value in update_data.items():
        setattr(restaurant, key, value)

    await db.flush()
    await db.refresh(restaurant)

    await log_action(
        db, restaurant.id, current_user.user_id,
        "UPDATE", "Restaurant", str(restaurant.id),
        details=data.model_dump(exclude_unset=True, mode="json"),
    )

    return restaurant


@router.delete("/{restaurant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_restaurant(
    restaurant_id: uuid.UUID,
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """Delete a restaurant and all associated users, menus, categories, and orders (superadmin only)."""
    result = await db.execute(
        select(Restaurant).where(Restaurant.id == restaurant_id)
    )
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found",
        )

    # 1. Protect any SUPERADMIN users by unlinking them from this restaurant_id
    await db.execute(
        update(User)
        .where(User.restaurant_id == restaurant_id, User.role == RoleEnum.SUPERADMIN)
        .values(restaurant_id=None)
    )

    # 2. Unlink user_id in audit_logs for any non-superadmin users about to be deleted
    users_to_delete = await db.execute(
        select(User.id).where(User.restaurant_id == restaurant_id, User.role != RoleEnum.SUPERADMIN)
    )
    user_ids = users_to_delete.scalars().all()
    if user_ids:
        await db.execute(
            update(AuditLog)
            .where(AuditLog.user_id.in_(user_ids))
            .values(user_id=None)
        )

    # 3. Log the audit action using restaurant.id BEFORE deleting the restaurant
    rest_name = restaurant.name
    rest_slug = restaurant.slug
    await log_action(
        db, restaurant.id, current_user.user_id,
        "DELETE", "Restaurant", str(restaurant_id),
        details={"name": rest_name, "slug": rest_slug},
    )
    await db.flush()

    # 4. Delete the restaurant entity (cascades to categories, menu items, variants, orders, sessions, etc.)
    await db.delete(restaurant)
    await db.flush()
