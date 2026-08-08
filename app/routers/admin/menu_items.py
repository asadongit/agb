"""
MenuItem admin routes — tenant-scoped CRUD.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import DBSession, RequireAdmin, tenant_scoped_query
from app.models.menu_item import MenuItem
from app.schemas.menu import MenuItemCreate, MenuItemResponse, MenuItemUpdate
from app.services.audit_service import log_action
from app.services.menu_service import invalidate_restaurant_menu

router = APIRouter(prefix="/api/admin/menu-items", tags=["admin-menu-items"])


@router.get("", response_model=list[MenuItemResponse])
async def list_menu_items(
    current_user: RequireAdmin,
    db: DBSession,
    category_id: uuid.UUID | None = None,
):
    """List menu items — optionally filter by category."""
    stmt = select(MenuItem)
    stmt = tenant_scoped_query(stmt, MenuItem, current_user.restaurant_id)
    if category_id:
        stmt = stmt.where(MenuItem.category_id == category_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "",
    response_model=MenuItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_menu_item(
    data: MenuItemCreate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Create a menu item — restaurant_id from JWT."""
    menu_item = MenuItem(
        id=uuid.uuid4(),
        restaurant_id=current_user.restaurant_id,  # FROM JWT
        **data.model_dump(),
    )
    db.add(menu_item)
    await db.flush()
    await db.refresh(menu_item)

    await invalidate_restaurant_menu(db, current_user.restaurant_id)

    await log_action(
        db, current_user.restaurant_id, current_user.user_id,
        "CREATE", "MenuItem", str(menu_item.id),
        details=data.model_dump(mode="json"),
    )

    return menu_item


@router.get("/{item_id}", response_model=MenuItemResponse)
async def get_menu_item(
    item_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Get a single menu item (tenant-scoped)."""
    stmt = select(MenuItem).where(MenuItem.id == item_id)
    stmt = tenant_scoped_query(stmt, MenuItem, current_user.restaurant_id)
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found",
        )
    return item


@router.patch("/{item_id}", response_model=MenuItemResponse)
async def update_menu_item(
    item_id: uuid.UUID,
    data: MenuItemUpdate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update a menu item (tenant-scoped)."""
    stmt = select(MenuItem).where(MenuItem.id == item_id)
    stmt = tenant_scoped_query(stmt, MenuItem, current_user.restaurant_id)
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)

    await db.flush()
    await db.refresh(item)

    # Invalidate cache — includes is_available toggle
    await invalidate_restaurant_menu(db, current_user.restaurant_id)

    await log_action(
        db, current_user.restaurant_id, current_user.user_id,
        "UPDATE", "MenuItem", str(item.id),
        details=update_data,
    )

    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_menu_item(
    item_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Delete a menu item (tenant-scoped, cascades to variants)."""
    stmt = select(MenuItem).where(MenuItem.id == item_id)
    stmt = tenant_scoped_query(stmt, MenuItem, current_user.restaurant_id)
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found",
        )

    await log_action(
        db, current_user.restaurant_id, current_user.user_id,
        "DELETE", "MenuItem", str(item.id),
        details={"name": item.name},
    )

    # Nullify reference in historical order_items so Foreign Key constraints never block item deletion
    from app.models.order_item import OrderItem
    from sqlalchemy import update
    await db.execute(
        update(OrderItem)
        .where(OrderItem.menu_item_id == item_id)
        .values(menu_item_id=None)
    )

    await db.delete(item)
    await db.flush()

    await invalidate_restaurant_menu(db, current_user.restaurant_id)
