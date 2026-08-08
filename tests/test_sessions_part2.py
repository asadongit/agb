"""
Part 2 tests — basket locking, session duration, extension, abandoned carts,
manual staff termination, and abandoned cart conversion.
"""

from __future__ import annotations

import pytest
from decimal import Decimal
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_restaurant,
    create_test_user,
    get_auth_headers,
)
from app.models.enums import RoleEnum


@pytest.mark.asyncio
class TestPart2Sessions:
    """Part 2 Basket QR & Customer Session System tests."""

    async def test_basket_locking_same_name_resumes(self, client, db_session):
        """Scanning same basket with exact same name resumes active session."""
        restaurant = await create_test_restaurant(db_session)
        await db_session.commit()

        # First scan
        resp1 = await client.post("/api/sessions/start", json={
            "restaurant_slug": restaurant.slug,
            "table_number": "5",
            "customer_name": "Alice Green",
            "customer_phone": "9876543210",
        })
        assert resp1.status_code == 200
        data1 = resp1.json()
        session_id_1 = data1["session_id"]

        # Rescan same basket with same name (case-insensitive normalized)
        resp2 = await client.post("/api/sessions/start", json={
            "restaurant_slug": restaurant.slug,
            "table_number": "5",
            "customer_name": "alice green",
        })
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["session_id"] == session_id_1

    async def test_basket_locking_different_name_blocked(self, client, db_session):
        """Scanning a basket already in use by another customer returns 409 Conflict."""
        restaurant = await create_test_restaurant(db_session)
        await db_session.commit()

        # Alice starts session at basket 5
        resp1 = await client.post("/api/sessions/start", json={
            "restaurant_slug": restaurant.slug,
            "table_number": "5",
            "customer_name": "Alice Green",
        })
        assert resp1.status_code == 200

        # Bob tries to start session at same basket 5
        resp2 = await client.post("/api/sessions/start", json={
            "restaurant_slug": restaurant.slug,
            "table_number": "5",
            "customer_name": "Bob Smith",
        })
        assert resp2.status_code == 409
        assert "currently in use by Alice Green" in resp2.json()["detail"]

    async def test_outlet_session_duration_setting(self, client, db_session):
        """Admin can configure session_duration_minutes in restaurant settings."""
        restaurant = await create_test_restaurant(db_session)
        admin = await create_test_user(db_session, restaurant, role=RoleEnum.RESTAURANT_ADMIN)
        await db_session.commit()
        headers = get_auth_headers(admin, restaurant)

        # Update duration to 45 mins
        resp = await client.patch("/api/admin/restaurants/me", json={
            "session_duration_minutes": 45,
        }, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["session_duration_minutes"] == 45

        # New session gets 45 min duration
        resp_sess = await client.post("/api/sessions/start", json={
            "restaurant_slug": restaurant.slug,
            "table_number": "10",
            "customer_name": "Charlie",
        })
        assert resp_sess.status_code == 200
        assert resp_sess.json()["session_duration_minutes"] == 45

    async def test_extend_session(self, client, db_session):
        """Customer can extend an active session."""
        restaurant = await create_test_restaurant(db_session)
        await db_session.commit()

        start_res = await client.post("/api/sessions/start", json={
            "restaurant_slug": restaurant.slug,
            "table_number": "12",
            "customer_name": "David",
        })
        session_id = start_res.json()["session_id"]
        old_expiry = start_res.json()["expires_at"]

        # Extend session
        ext_res = await client.post(f"/api/sessions/{session_id}/extend")
        assert ext_res.status_code == 200
        new_expiry = ext_res.json()["expires_at"]
        assert new_expiry >= old_expiry

    async def test_abandon_cart_push_and_conversion(self, client, db_session):
        """Customer pushes local cart on expiry -> Admin sees abandoned cart and converts to bill."""
        restaurant = await create_test_restaurant(db_session)
        admin = await create_test_user(db_session, restaurant, role=RoleEnum.RESTAURANT_ADMIN)
        cat = await create_test_category(db_session, restaurant)
        item = await create_test_menu_item(db_session, restaurant, cat, name="Fresh Apples", price=Decimal("120.00"))
        await db_session.commit()
        headers = get_auth_headers(admin, restaurant)

        start_res = await client.post("/api/sessions/start", json={
            "restaurant_slug": restaurant.slug,
            "table_number": "3",
            "customer_name": "Eve",
            "customer_phone": "9998887776",
        })
        session_id = start_res.json()["session_id"]

        # Push local cart on expiry
        push_res = await client.post(f"/api/sessions/{session_id}/abandon-cart", json={
            "items": [{
                "menu_item_id": str(item.id),
                "name": "Fresh Apples",
                "quantity": 2.5,
                "unit_price": 120.00,
                "pricing_mode": "WEIGHT_BASED",
                "unit_label": "kg",
            }],
            "total_estimate": 300.00,
        })
        assert push_res.status_code == 200
        cart_id = push_res.json()["abandoned_cart_id"]
        assert cart_id is not None

        # Admin lists abandoned carts
        list_res = await client.get("/api/admin/sessions/abandoned-carts", headers=headers)
        assert list_res.status_code == 200
        carts = list_res.json()
        assert len(carts) >= 1
        found_cart = next(c for c in carts if c["id"] == cart_id)
        assert found_cart["customer_name"] == "Eve"
        assert found_cart["table_number"] == "3"
        assert found_cart["total_estimate"] == 300.00

        # Admin count
        count_res = await client.get("/api/admin/sessions/abandoned-carts/count", headers=headers)
        assert count_res.status_code == 200
        assert count_res.json()["count"] >= 1

        # Admin converts abandoned cart to manual bill
        convert_res = await client.post(f"/api/admin/sessions/abandoned-carts/{cart_id}/convert", headers=headers)
        assert convert_res.status_code == 200
        assert convert_res.json()["status"] == "converted"
        assert convert_res.json()["order_id"] is not None

    async def test_manual_session_termination(self, client, db_session):
        """Staff/Manager can manually terminate an active session."""
        restaurant = await create_test_restaurant(db_session)
        admin = await create_test_user(db_session, restaurant, role=RoleEnum.RESTAURANT_ADMIN)
        await db_session.commit()
        headers = get_auth_headers(admin, restaurant)

        start_res = await client.post("/api/sessions/start", json={
            "restaurant_slug": restaurant.slug,
            "table_number": "7",
            "customer_name": "Frank",
        })
        session_id = start_res.json()["session_id"]

        # Admin lists active sessions
        active_res = await client.get("/api/admin/sessions", headers=headers)
        assert active_res.status_code == 200
        assert any(s["id"] == session_id for s in active_res.json())

        # Admin terminates session
        term_res = await client.post(f"/api/admin/sessions/{session_id}/terminate", json={
            "reason": "Customer left store without completing basket",
        }, headers=headers)
        assert term_res.status_code == 200
        assert term_res.json()["status"] == "terminated"

        # Check status endpoint shows non-active
        status_res = await client.get(f"/api/sessions/{session_id}")
        assert status_res.status_code == 200
        assert status_res.json()["is_active"] is False
        assert status_res.json()["status"] == "TERMINATED"
