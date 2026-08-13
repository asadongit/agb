"""
Auth tests — registration, login, token refresh, role enforcement.
"""

from __future__ import annotations

import pytest

from app.models.enums import RoleEnum
from tests.conftest import (
    create_test_outlet,
    create_test_user,
    get_auth_headers,
)


@pytest.mark.asyncio
class TestAuth:
    """Auth endpoint tests."""

    async def test_register_and_login(self, client, db_session):
        """Register a user, then log in and receive tokens."""
        outlet = await create_test_outlet(db_session)
        admin = await create_test_user(db_session, outlet, role=RoleEnum.SUPERADMIN)
        await db_session.commit()
        headers = get_auth_headers(admin, outlet)

        # Register
        resp = await client.post(
            "/api/auth/register",
            json={
                "email": "newuser@test.com",
                "password": "securepassword123",
                "role": "STAFF",
                "outlet_id": str(outlet.id),
            },
            headers=headers,
        )
        assert resp.status_code == 201

        # Login
        resp = await client.post("/api/auth/login", json={
            "email": "newuser@test.com",
            "password": "securepassword123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client, db_session):
        """Login with wrong password returns 401."""
        outlet = await create_test_outlet(db_session)
        await create_test_user(db_session, outlet)
        await db_session.commit()

        resp = await client.post("/api/auth/login", json={
            "email": "admin@test.com",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    async def test_duplicate_registration(self, client, db_session):
        """Registering duplicate email returns 409."""
        outlet = await create_test_outlet(db_session)
        admin = await create_test_user(db_session, outlet, role=RoleEnum.SUPERADMIN)
        await db_session.commit()
        headers = get_auth_headers(admin, outlet)

        resp = await client.post(
            "/api/auth/register",
            json={
                "email": "admin@test.com",
                "password": "anotherpassword123",
                "role": "STAFF",
                "outlet_id": str(outlet.id),
            },
            headers=headers,
        )
        assert resp.status_code == 409

    async def test_token_refresh(self, client, db_session):
        """Refresh token returns new access + refresh tokens."""
        outlet = await create_test_outlet(db_session)
        await create_test_user(db_session, outlet)
        await db_session.commit()

        # Login first
        resp = await client.post("/api/auth/login", json={
            "email": "admin@test.com",
            "password": "testpassword123",
        })
        tokens = resp.json()

        # Refresh
        resp = await client.post("/api/auth/refresh", json={
            "refresh_token": tokens["refresh_token"],
        })
        assert resp.status_code == 200
        new_tokens = resp.json()
        assert new_tokens["access_token"] != tokens["access_token"]

    async def test_protected_route_no_token(self, client):
        """Accessing protected route without token returns 401."""
        resp = await client.get("/api/admin/outlets/me")
        assert resp.status_code == 401

    async def test_logout(self, client, db_session):
        """Logout revokes refresh token."""
        outlet = await create_test_outlet(db_session)
        user = await create_test_user(db_session, outlet)
        await db_session.commit()

        headers = get_auth_headers(user, outlet)
        resp = await client.post("/api/auth/logout", headers=headers)
        assert resp.status_code == 200

    async def test_staff_token_refresh_and_logout(self, client, db_session):
        """Staff login, refresh token rotation, and logout token revocation."""
        from tests.conftest import create_test_staff
        from app.core.security import create_access_token

        outlet = await create_test_outlet(db_session)
        staff = await create_test_staff(db_session, outlet, email="staff1@test.com", password="password123")
        await db_session.commit()

        # 1. Staff Login
        resp = await client.post("/api/staff/login", json={
            "email": "staff1@test.com",
            "password": "password123",
        })
        assert resp.status_code == 200
        tokens = resp.json()
        refresh_token_1 = tokens["refresh_token"]

        # 2. Staff Refresh Token Rotation
        resp = await client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token_1,
        })
        assert resp.status_code == 200
        refreshed = resp.json()
        refresh_token_2 = refreshed["refresh_token"]
        assert refresh_token_1 != refresh_token_2

        # 3. Old refresh token replay fails with 401
        resp = await client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token_1,
        })
        assert resp.status_code == 401

        # 4. Staff Logout
        staff_token = create_access_token(user_id=staff.id, outlet_id=outlet.id, role=staff.role.value)
        headers = {"Authorization": f"Bearer {staff_token}"}
        resp = await client.post("/api/auth/logout", headers=headers)
        assert resp.status_code == 200

        # 5. Refresh token after logout fails with 401
        resp = await client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token_2,
        })
        assert resp.status_code == 401
