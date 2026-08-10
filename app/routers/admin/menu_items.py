"""
MenuItem admin routes — tenant-scoped product CRUD with variants, categories, barcodes, and image uploads.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.dependencies import DBSession, RequireAdmin, tenant_scoped_query
from app.models.category import Category
from app.models.enums import PricingModeEnum
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.schemas.menu import (
    MenuItemCreate,
    MenuItemResponse,
    MenuItemUpdate,
)
from app.services.audit_service import log_action

router = APIRouter(prefix="/api/admin/menu-items", tags=["admin-menu-items"])


@router.get("", response_model=list[MenuItemResponse])
@router.get("/", response_model=list[MenuItemResponse])
async def list_menu_items(
    current_user: RequireAdmin,
    db: DBSession,
    category_id: uuid.UUID | None = None,
    available_only: bool = False,
    pricing_mode: PricingModeEnum | None = None,
    search: str | None = None,
):
    """List all menu items for the current outlet with variants."""
    stmt = (
        select(MenuItem)
        .options(selectinload(MenuItem.variants))
        .where(MenuItem.outlet_id == current_user.outlet_id)
    )

    if category_id:
        stmt = stmt.where(MenuItem.category_id == category_id)
    if available_only:
        stmt = stmt.where(MenuItem.is_available == True)  # noqa: E712
    if pricing_mode:
        stmt = stmt.where(MenuItem.pricing_mode == pricing_mode)
    if search:
        s = f"%{search.strip()}%"
        stmt = stmt.where(MenuItem.name.ilike(s) | MenuItem.barcode.ilike(s))

    stmt = stmt.order_by(MenuItem.name.asc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/barcode/{barcode}", response_model=MenuItemResponse)
async def get_menu_item_by_barcode(
    barcode: str,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Look up a menu item / product by its barcode for POS billing."""
    res = await db.execute(
        select(MenuItem)
        .options(selectinload(MenuItem.variants))
        .where(
            MenuItem.outlet_id == current_user.outlet_id,
            MenuItem.barcode == barcode.strip(),
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with barcode '{barcode}' not found",
        )
    return item


@router.post("", response_model=MenuItemResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=MenuItemResponse, status_code=status.HTTP_201_CREATED)
async def create_menu_item(
    data: MenuItemCreate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Create a new menu item / product."""
    # Verify category belongs to tenant
    cat_res = await db.execute(
        select(Category).where(
            Category.id == data.category_id,
            Category.outlet_id == current_user.outlet_id,
        )
    )
    if not cat_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    item = MenuItem(
        id=uuid.uuid4(),
        outlet_id=current_user.outlet_id,
        category_id=data.category_id,
        name=data.name.strip(),
        barcode=data.barcode.strip() if data.barcode else None,
        description=data.description,
        price=data.price,
        image_url=data.image_url,
        is_available=data.is_available,
        is_on_offer=data.is_on_offer,
        is_verification_required=data.is_verification_required,
        offer_price=data.offer_price,
        offer_label=data.offer_label,
        pricing_mode=data.pricing_mode,
        unit_label=data.unit_label,
    )
    db.add(item)
    await db.flush()

    # Add initial variants if provided
    if hasattr(data, "variants") and getattr(data, "variants", None):
        for v in data.variants:
            variant = MenuItemVariant(
                id=uuid.uuid4(),
                menu_item_id=item.id,
                name=v.name.strip(),
                price_delta=v.price_delta,
                is_available=v.is_available,
            )
            db.add(variant)
        await db.flush()

    await db.refresh(item)
    # Load variants
    res = await db.execute(
        select(MenuItem)
        .options(selectinload(MenuItem.variants))
        .where(MenuItem.id == item.id)
    )
    item_loaded = res.scalar_one()

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "CREATE_MENU_ITEM",
        "MenuItem",
        str(item.id),
        details={"name": item.name, "price": str(item.price)},
    )
    return item_loaded


@router.get("/{item_id}", response_model=MenuItemResponse)
async def get_menu_item(
    item_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Get single menu item by ID."""
    res = await db.execute(
        select(MenuItem)
        .options(selectinload(MenuItem.variants))
        .where(
            MenuItem.id == item_id,
            MenuItem.outlet_id == current_user.outlet_id,
        )
    )
    item = res.scalar_one_or_none()
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
    """Update a menu item."""
    res = await db.execute(
        select(MenuItem)
        .options(selectinload(MenuItem.variants))
        .where(
            MenuItem.id == item_id,
            MenuItem.outlet_id == current_user.outlet_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found",
        )

    if data.category_id is not None:
        cat_res = await db.execute(
            select(Category).where(
                Category.id == data.category_id,
                Category.outlet_id == current_user.outlet_id,
            )
        )
        if not cat_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found",
            )
        item.category_id = data.category_id

    if data.name is not None:
        item.name = data.name.strip()
    if data.barcode is not None:
        item.barcode = data.barcode.strip() if data.barcode else None
    if data.description is not None:
        item.description = data.description
    if data.price is not None:
        item.price = data.price
    if data.image_url is not None:
        item.image_url = data.image_url
    if data.is_available is not None:
        item.is_available = data.is_available
    if data.is_on_offer is not None:
        item.is_on_offer = data.is_on_offer
    if data.is_verification_required is not None:
        item.is_verification_required = data.is_verification_required
    if data.offer_price is not None:
        item.offer_price = data.offer_price
    if data.offer_label is not None:
        item.offer_label = data.offer_label
    if data.pricing_mode is not None:
        item.pricing_mode = data.pricing_mode
    if data.unit_label is not None:
        item.unit_label = data.unit_label

    await db.flush()
    await db.refresh(item)

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "UPDATE_MENU_ITEM",
        "MenuItem",
        str(item.id),
        details={"name": item.name},
    )
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_menu_item(
    item_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Delete a menu item."""
    res = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_id,
            MenuItem.outlet_id == current_user.outlet_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found",
        )

    await db.delete(item)
    await db.flush()

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "DELETE_MENU_ITEM",
        "MenuItem",
        str(item_id),
    )
