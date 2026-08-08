"""
Menu tests — CRUD, tenant isolation, cache invalidation, public endpoint.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models.enums import PaymentModeEnum, RoleEnum
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_restaurant,
    create_test_user,
    create_test_variant,
    get_auth_headers,
)


@pytest.mark.asyncio
class TestCategoryAdmin:
    """Category CRUD tests."""

    async def test_create_category(self, client, db_session):
        restaurant = await create_test_restaurant(db_session)
        user = await create_test_user(db_session, restaurant)
        await db_session.commit()

        headers = get_auth_headers(user, restaurant)
        resp = await client.post(
            "/api/admin/categories",
            json={"name": "Burgers", "display_order": 1},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Burgers"
        assert data["restaurant_id"] == str(restaurant.id)

    async def test_list_categories(self, client, db_session):
        restaurant = await create_test_restaurant(db_session)
        user = await create_test_user(db_session, restaurant)
        await create_test_category(db_session, restaurant, name="Burgers")
        await create_test_category(db_session, restaurant, name="Drinks")
        await db_session.commit()

        headers = get_auth_headers(user, restaurant)
        resp = await client.get("/api/admin/categories", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_tenant_isolation(self, client, db_session):
        """Categories from another restaurant must NOT be visible."""
        r1 = await create_test_restaurant(db_session, slug="r1", name="R1")
        r2 = await create_test_restaurant(db_session, slug="r2", name="R2")
        u1 = await create_test_user(db_session, r1, email="u1@test.com")
        cat2 = await create_test_category(db_session, r2, name="Secret Menu")
        await db_session.commit()

        headers = get_auth_headers(u1, r1)
        # Try to access r2's category from r1's token — should 404
        resp = await client.get(
            f"/api/admin/categories/{cat2.id}",
            headers=headers,
        )
        assert resp.status_code == 404

    async def test_delete_category(self, client, db_session):
        restaurant = await create_test_restaurant(db_session)
        user = await create_test_user(db_session, restaurant)
        cat = await create_test_category(db_session, restaurant)
        await db_session.commit()

        headers = get_auth_headers(user, restaurant)
        resp = await client.delete(
            f"/api/admin/categories/{cat.id}",
            headers=headers,
        )
        assert resp.status_code == 204


@pytest.mark.asyncio
class TestMenuItemAdmin:
    """MenuItem CRUD tests."""

    async def test_create_menu_item(self, client, db_session):
        restaurant = await create_test_restaurant(db_session)
        user = await create_test_user(db_session, restaurant)
        cat = await create_test_category(db_session, restaurant)
        await db_session.commit()

        headers = get_auth_headers(user, restaurant)
        resp = await client.post(
            "/api/admin/menu-items",
            json={
                "category_id": str(cat.id),
                "name": "Classic Burger",
                "price": "9.99",
                "is_available": True,
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["price"] == "9.99"
        assert data["restaurant_id"] == str(restaurant.id)

    async def test_toggle_availability(self, client, db_session):
        restaurant = await create_test_restaurant(db_session)
        user = await create_test_user(db_session, restaurant)
        cat = await create_test_category(db_session, restaurant)
        item = await create_test_menu_item(db_session, restaurant, cat)
        await db_session.commit()

        headers = get_auth_headers(user, restaurant)
        resp = await client.patch(
            f"/api/admin/menu-items/{item.id}",
            json={"is_available": False},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_available"] is False


@pytest.mark.asyncio
class TestVariantAdmin:
    """Variant CRUD tests."""

    async def test_create_variant(self, client, db_session):
        restaurant = await create_test_restaurant(db_session)
        user = await create_test_user(db_session, restaurant)
        cat = await create_test_category(db_session, restaurant)
        item = await create_test_menu_item(db_session, restaurant, cat)
        await db_session.commit()

        headers = get_auth_headers(user, restaurant)
        resp = await client.post(
            f"/api/admin/menu-items/{item.id}/variants",
            json={"name": "Large", "price_delta": "2.50"},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Large"
        assert data["price_delta"] == "2.50"


@pytest.mark.asyncio
class TestPublicMenu:
    """Public menu endpoint tests."""

    async def test_get_public_menu(self, client, db_session):
        restaurant = await create_test_restaurant(db_session)
        cat = await create_test_category(db_session, restaurant)
        item = await create_test_menu_item(db_session, restaurant, cat)
        variant = await create_test_variant(db_session, item)
        await db_session.commit()

        resp = await client.get(f"/api/public/menu/{restaurant.slug}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["restaurant_name"] == restaurant.name
        assert len(data["categories"]) == 1
        assert len(data["categories"][0]["items"]) == 1
        assert len(data["categories"][0]["items"][0]["variants"]) == 1

    async def test_menu_not_found(self, client, db_session):
        resp = await client.get("/api/public/menu/nonexistent-slug")
        assert resp.status_code == 404
