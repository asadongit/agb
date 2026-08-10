"""
Integration tests for Barcode Scanner Inventory, Batch Tracking, and Wastage/Write-Off workflows.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import RoleEnum
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_barcode_lookup_not_found(client: AsyncClient, db_session: AsyncSession):
    """Scan lookup for unknown barcode returns found=False without error."""
    outlet = await create_test_outlet(db_session, slug="test-scan-mart", name="Scan Mart")
    admin = await create_test_user(db_session, outlet, email="admin@scanmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    resp = await client.get("/api/admin/inventory/barcode/999888777666", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["found"] is False
    assert data["barcode"] == "999888777666"
    assert data["item"] is None


@pytest.mark.asyncio
async def test_first_time_scan_onboard(client: AsyncClient, db_session: AsyncSession):
    """First-time scan: Staff tags new barcode, saves item, initial batch, and selling price."""
    outlet = await create_test_outlet(db_session, slug="test-scan-mart-2", name="Scan Mart 2")
    admin = await create_test_user(db_session, outlet, email="admin2@scanmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    payload = {
        "barcode": "8901262010015",
        "name": "Amul Pure Ghee 1L Pouch",
        "category": "Dairy",
        "unit": "pcs",
        "initial_stock": 10.0,
        "cost_per_unit": 520.0,
        "selling_price": 590.0,
        "batch_number": "BAT-2026-GHEE-01",
        "supplier_name": "Gujarat Co-op Milk Federation",
    }
    resp = await client.post("/api/admin/inventory/scan-onboard", json=payload, headers=headers)
    assert resp.status_code == 201
    item = resp.json()
    assert item["barcode"] == "8901262010015"
    assert item["name"] == "Amul Pure Ghee 1L Pouch"
    assert float(item["current_stock"]) == 10.0

    # Verify lookup finds it now
    lookup_resp = await client.get("/api/admin/inventory/barcode/8901262010015", headers=headers)
    assert lookup_resp.status_code == 200
    assert lookup_resp.json()["found"] is True
    assert lookup_resp.json()["item"]["id"] == item["id"]


@pytest.mark.asyncio
async def test_subsequent_scan_increment(client: AsyncClient, db_session: AsyncSession):
    """Subsequent scan: Instantly increments item count (+1 or batch) with unique lot generation."""
    outlet = await create_test_outlet(db_session, slug="test-scan-mart-3", name="Scan Mart 3")
    admin = await create_test_user(db_session, outlet, email="admin3@scanmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # First onboard
    await client.post(
        "/api/admin/inventory/scan-onboard",
        json={"barcode": "8901262010015", "name": "Amul Ghee", "initial_stock": 10.0, "cost_per_unit": 500.0},
        headers=headers,
    )

    # Subsequent scan +5
    resp = await client.post(
        "/api/admin/inventory/scan-increment",
        json={"barcode": "8901262010015", "quantity": 5.0},
        headers=headers,
    )
    assert resp.status_code == 200
    item = resp.json()
    assert float(item["current_stock"]) == 15.0  # 10 + 5


@pytest.mark.asyncio
async def test_batches_listing_and_wastage_log(client: AsyncClient, db_session: AsyncSession):
    """Verify batch lots listing and test logging wastage/loss against an item."""
    outlet = await create_test_outlet(db_session, slug="test-scan-mart-4", name="Scan Mart 4")
    admin = await create_test_user(db_session, outlet, email="admin4@scanmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # Onboard item
    onboard_resp = await client.post(
        "/api/admin/inventory/scan-onboard",
        json={
            "barcode": "8901262010015",
            "name": "Amul Ghee",
            "initial_stock": 15.0,
            "cost_per_unit": 520.0,
            "batch_number": "BAT-GHEE-44",
        },
        headers=headers,
    )
    item_id = onboard_resp.json()["id"]

    # List batches
    batches_resp = await client.get("/api/admin/inventory/batches", headers=headers)
    assert batches_resp.status_code == 200
    batches = batches_resp.json()
    assert len(batches) >= 1

    # Log Wastage (e.g. 2 pcs damaged in transit)
    waste_payload = {
        "item_id": item_id,
        "quantity": 2.0,
        "reason": "DAMAGED_TRANSIT",
        "notes": "Pouch leaked during delivery unloading",
    }
    waste_resp = await client.post("/api/admin/inventory/wastage", json=waste_payload, headers=headers)
    assert waste_resp.status_code == 200
    waste_data = waste_resp.json()
    assert waste_data["success"] is True
    assert float(waste_data["quantity_wasted"]) == 2.0
    assert float(waste_data["new_current_stock"]) == 13.0  # 15 - 2
    assert float(waste_data["estimated_loss_amount"]) == 1040.0  # 2 * 520 cost

    # Verify Stock Ledger has MANUAL_ADJUSTMENT entry
    ledger_resp = await client.get("/api/admin/inventory/ledger", headers=headers)
    assert ledger_resp.status_code == 200
    ledger_items = ledger_resp.json()["items"]
    waste_entry = next((e for e in ledger_items if e["item_id"] == item_id and e["change_type"] in ["MANUAL_ADJUSTMENT", "manual_adjustment"]), None)
    assert waste_entry is not None
    assert float(waste_entry["quantity_change"]) == -2.0
