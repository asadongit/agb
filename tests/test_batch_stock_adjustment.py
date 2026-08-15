import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_purchase_return_to_supplier(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test returning stock to supplier, deducting batch/item stock, and issuing return bill."""
    outlet = await create_test_outlet(db_session, slug="batch-adjust-outlet", name="Adjust Outlet")
    user = await create_test_user(db_session, outlet, email="admin_adj@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item with initial stock 50
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8909999000111",
            "name": "Supplier Wheat Flour 10kg",
            "category": "Grains",
            "unit": "kg",
            "initial_stock": 50,
            "cost_per_unit": 40.0,
            "selling_price": 50.0,
            "supplier_name": "Agro Suppliers Co",
            "batch_number": "BATCH-WHEAT-01",
        },
    )
    assert onboard_res.status_code == 201

    # 2. Get batch ID
    batches_res = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    assert batches_res.status_code == 200
    batches = batches_res.json()
    assert len(batches) >= 1
    target_batch = next(b for b in batches if b["batch_number"] == "BATCH-WHEAT-01")

    # 3. Process PURCHASE_RETURN of 10 kg
    return_payload = {
        "adjustment_type": "PURCHASE_RETURN",
        "quantity": 10.0,
        "reason": "DEFECTIVE",
        "supplier_name": "Agro Suppliers Co",
        "notes": "Damaged sacks received",
    }
    adj_res = await client.post(
        f"/api/admin/inventory/batches/{target_batch['id']}/adjust",
        headers=auth_headers,
        json=return_payload,
    )
    assert adj_res.status_code == 200
    adj_data = adj_res.json()
    assert adj_data["status"] == "success"
    assert adj_data["return_id"] is not None
    assert "return_number" in adj_data

    # 4. Verify return bill can be retrieved via API
    bill_res = await client.get(
        f"/api/admin/inventory/purchase-returns/{adj_data['return_id']}",
        headers=auth_headers,
    )
    assert bill_res.status_code == 200
    bill_data = bill_res.json()
    assert bill_data["supplier_name"] == "Agro Suppliers Co"
    assert float(bill_data["quantity"]) == 10.0
    assert float(bill_data["total_refund_amount"]) == 400.0  # 10 * 40.0

    # 5. Verify batch remaining quantity is now 40
    batches_res_2 = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    target_batch_2 = next(b for b in batches_res_2.json() if b["id"] == target_batch["id"])
    assert float(target_batch_2["remaining_quantity"]) == 40.0


@pytest.mark.asyncio
async def test_void_batch_stock(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test voiding an entire batch entry."""
    outlet = await create_test_outlet(db_session, slug="void-batch-outlet", name="Void Outlet")
    user = await create_test_user(db_session, outlet, email="admin_void@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item with initial stock 30
    await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "name": "Accidental Duplicate Milk Crate",
            "category": "Dairy",
            "unit": "pcs",
            "initial_stock": 30,
            "cost_per_unit": 60.0,
            "selling_price": 75.0,
            "batch_number": "BATCH-MILK-ERR",
        },
    )

    # Get batch
    batches = (await client.get("/api/admin/inventory/batches", headers=auth_headers)).json()
    milk_batch = next(b for b in batches if b["batch_number"] == "BATCH-MILK-ERR")

    # 2. Void Batch
    void_res = await client.post(
        f"/api/admin/inventory/batches/{milk_batch['id']}/adjust",
        headers=auth_headers,
        json={
            "adjustment_type": "VOID_BATCH",
            "quantity": 30.0,
            "notes": "Entered by mistake",
        },
    )
    assert void_res.status_code == 200

    # 3. Verify batch remaining stock is 0
    batches_after = (await client.get("/api/admin/inventory/batches", headers=auth_headers)).json()
    updated_batch = next(b for b in batches_after if b["id"] == milk_batch["id"])
    assert float(updated_batch["remaining_quantity"]) == 0.0
