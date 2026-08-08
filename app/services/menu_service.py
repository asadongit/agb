"""
Menu service — public menu tree builder + admin CRUD cache invalidation.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import tenant_scoped_query
from app.models.category import Category
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.models.restaurant import Restaurant
from app.services.cache_service import (
    acquire_menu_lock,
    get_cached_menu,
    invalidate_menu_cache,
    release_menu_lock,
    set_cached_menu,
    wait_for_cache,
)


async def get_public_menu(db: AsyncSession, slug: str) -> dict:
    """
    Cache-aside with thundering-herd protection.
    1. Check Redis cache
    2. On miss, acquire lock → query Postgres → cache → release
    3. If lock held by another, wait and retry cache
    """
    # 1. Cache hit?
    cached = await get_cached_menu(slug)
    if cached:
        return cached

    # 2. Try to acquire lock
    if await acquire_menu_lock(slug):
        try:
            # Double-check after acquiring lock
            cached = await get_cached_menu(slug)
            if cached:
                return cached

            # Query Postgres
            menu_data = await _build_menu_tree(db, slug)
            await set_cached_menu(slug, menu_data)
            return menu_data
        finally:
            await release_menu_lock(slug)
    else:
        # 3. Lock held — wait for the other request to populate cache
        cached = await wait_for_cache(slug)
        if cached:
            return cached

        # Fallback: query directly (lock holder may have failed)
        return await _build_menu_tree(db, slug)


async def _build_menu_tree(db: AsyncSession, slug: str) -> dict:
    """
    Build the nested JSON tree: Restaurant → Categories → MenuItems → Variants.
    Only includes available items with available variants.
    """
    result = await db.execute(
        select(Restaurant).where(Restaurant.slug == slug)
    )
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Restaurant '{slug}' not found",
        )

    # Eager load the full tree
    categories_result = await db.execute(
        select(Category)
        .where(Category.restaurant_id == restaurant.id)
        .options(
            selectinload(Category.menu_items).selectinload(MenuItem.variants)
        )
        .order_by(Category.display_order)
    )
    categories = categories_result.scalars().all()

    return {
        "restaurant_name": restaurant.name,
        "restaurant_slug": restaurant.slug,
        "payment_mode": restaurant.payment_mode,
        "logo_url": getattr(restaurant, "logo_url", None),
        "categories": [
            {
                "id": str(cat.id),
                "name": cat.name,
                "display_order": cat.display_order,
                "items": [
                    {
                        "id": str(item.id),
                        "name": item.name,
                        "description": item.description,
                        "price": str(item.price),
                        "image_url": item.image_url,
                        "is_available": item.is_available,
                        "is_on_offer": getattr(item, "is_on_offer", False),
                        "offer_price": str(item.offer_price) if getattr(item, "offer_price", None) is not None else None,
                        "offer_label": getattr(item, "offer_label", None),
                        "variants": [
                            {
                                "id": str(v.id),
                                "name": v.name,
                                "price_delta": str(v.price_delta),
                                "is_available": v.is_available,
                            }
                            for v in item.variants
                            if v.is_available
                        ],
                    }
                    for item in cat.menu_items
                    if item.is_available  # ONLY SHOW AVAILABLE ITEMS TO DINERS!
                ],
            }
            for cat in categories
        ],
    }


async def get_restaurant_slug(
    db: AsyncSession, restaurant_id: uuid.UUID
) -> str:
    """Get slug for a restaurant by ID — used for cache invalidation."""
    result = await db.execute(
        select(Restaurant.slug).where(Restaurant.id == restaurant_id)
    )
    slug = result.scalar_one_or_none()
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found",
        )
    return slug


async def invalidate_restaurant_menu(
    db: AsyncSession, restaurant_id: uuid.UUID
) -> None:
    """
    Invalidate the cached menu for a restaurant.
    MUST be called after any Category/MenuItem/Variant create/update/delete.
    """
    slug = await get_restaurant_slug(db, restaurant_id)
    await invalidate_menu_cache(slug)


async def get_public_restaurants(db: AsyncSession) -> list[dict]:
    """Get list of active restaurants for the public restaurant selector screen."""
    result = await db.execute(
        select(Restaurant).order_by(Restaurant.name)
    )
    restaurants = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "slug": r.slug,
        }
        for r in restaurants
    ]

