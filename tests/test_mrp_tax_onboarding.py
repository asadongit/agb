"""
Tests for MRP, Tax Category, and Total Billed & Sorted Quantity Unit Cost Calculator.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import RoleEnum
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_onboard_with_total_billed_and_sorted_qty_calculator(client: AsyncClient, db_session: AsyncSession):
    """Test inwarding stock with total billed amount (₹1000) and sorted usable qty (80 kg out of 100 kg initial)."""
    outlet = await create_test_outlet(db_session, slug="test-mrp-mart", name="MRP Mart")
    admin = await create_test_user(db_session, outlet, email="admin@mrpmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    payload = {
        "barcode": "8901234567890",
        "name": "Fresh Organic Potatoes",
        "category": "Vegetables",
        "unit": "kg",
        "initial_stock": 100.0,
        "sorted_quantity": 80.0,
        "total_billed_amount": 1000.0,
        "mrp": 25.0,
        "selling_price": 20.0,
        "tax_category": "GST 5%",
        "tax_rate": 5.0,
    }
    resp = await client.post("/api/admin/inventory/scan-onboard", json=payload, headers=headers)
    assert resp.status_code == 201
    item = resp.json()

    # Net stock should be 80.0 (sorted quantity)
    assert float(item["current_stock"]) == 80.0
    # Cost per unit should be ₹1000 / 80 = ₹12.50
    assert float(item["cost_per_unit"]) == 12.50
    assert float(item["mrp"]) == 25.0
    assert item["tax_category"] == "GST 5%"
    assert float(item["tax_rate"]) == 5.0

    # Verify menu item was created with MRP, selling_price, tax_category, tax_rate
    menu_resp = await client.get("/api/admin/menu-items", headers=headers)
    assert menu_resp.status_code == 200
    menu_items = menu_resp.json()
    assert len(menu_items) >= 1
    potatoes_menu = next(m for m in menu_items if m["name"] == "Fresh Organic Potatoes")
    assert float(potatoes_menu["price"]) == 20.0
    assert float(potatoes_menu["mrp"]) == 25.0
    assert potatoes_menu["tax_category"] == "GST 5%"
    assert float(potatoes_menu["tax_rate"]) == 5.0

    # Test activating special offer via PATCH
    offer_patch = {
        "is_on_offer": True,
        "offer_price": 15.0,
        "offer_label": "25% OFF",
    }
    patch_resp = await client.patch(f"/api/admin/menu-items/{potatoes_menu['id']}", json=offer_patch, headers=headers)
    assert patch_resp.status_code == 200
    updated_menu = patch_resp.json()
    assert updated_menu["is_on_offer"] is True
    assert float(updated_menu["offer_price"]) == 15.0
    assert updated_menu["offer_label"] == "25% OFF"

    # Test deactivating special offer via PATCH
    deactivate_patch = {
        "is_on_offer": False,
        "offer_price": None,
        "offer_label": None,
    }
    deact_resp = await client.patch(f"/api/admin/menu-items/{potatoes_menu['id']}", json=deactivate_patch, headers=headers)
    assert deact_resp.status_code == 200
    deact_menu = deact_resp.json()
    assert deact_menu["is_on_offer"] is False
    assert deact_menu["offer_price"] is None
    assert deact_menu["offer_label"] == None
