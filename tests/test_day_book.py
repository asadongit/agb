"""
Tests for Day Book report API — verifying party identities (Customer, Supplier, Staff).
"""

from datetime import datetime
from decimal import Decimal
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash_drawer_ledger import CashDrawerLedger
from app.models.enums import RoleEnum
from app.models.inventory_item import InventoryItem
from app.models.stock_intake import StockIntake
from app.models.supplier import Supplier
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_outlet,
    create_test_user,
    get_auth_headers,
)


@pytest.mark.asyncio
async def test_day_book_party_identity(client: AsyncClient, db_session: AsyncSession):
    outlet = await create_test_outlet(db_session, slug="daybook-outlet", name="DayBook Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_daybook@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    admin.name = "Cashier Bob"
    admin.phone = "9876500001"
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, name="Organic Apples", price=Decimal("150.00"))
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)
    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    # 1. SALE event (Customer)
    bill_payload = {
        "basket_number": "BK-001",
        "customer_name": "Alice Customer",
        "customer_phone": "9876543210",
        "items": [
            {
                "menu_item_id": str(item.id),
                "quantity": 2,
                "unit_price": 150.0,
                "mrp": 160.0,
                "tax_rate": 0.0,
            }
        ],
    }
    res_bill = await client.post("/api/billing/bills", json=bill_payload, headers=auth_headers)
    assert res_bill.status_code == 200
    bill = res_bill.json()

    res_paid = await client.post(
        f"/api/billing/bills/{bill['id']}/mark-paid",
        json={"payment_method": "CASH", "cash_denominations": {"500": 1}},
        headers=auth_headers,
    )
    assert res_paid.status_code == 200

    # 2. CUSTOMER_RETURN event (Customer)
    return_payload = {
        "order_id": bill["id"],
        "customer_name": "Alice Customer",
        "customer_phone": "9876543210",
        "return_items": [
            {
                "order_item_id": bill["items"][0]["id"],
                "quantity": 1,
                "reason": "DEFECTIVE_PRODUCT",
            }
        ],
        "refund_payment_method": "CASH",
        "notes": "Returning 1 apple",
    }
    res_return = await client.post("/api/billing/returns", json=return_payload, headers=auth_headers)
    assert res_return.status_code == 200

    # 3. CASH_DEPOSIT / CASH_WITHDRAWAL event (Staff)
    deposit_entry = CashDrawerLedger(
        outlet_id=outlet.id,
        transaction_type="MANUAL_DEPOSIT",
        denominations={"500": 2},
        notes="Opening float top-up",
        created_by=admin.id,
    )
    db_session.add(deposit_entry)

    # 4. STOCK_INTAKE event (Supplier)
    supplier = Supplier(
        outlet_id=outlet.id,
        name="Fresh Valley Farms",
        phone="9123456789",
    )
    db_session.add(supplier)
    await db_session.flush()

    inv_item = InventoryItem(
        outlet_id=outlet.id,
        name="Fresh Oranges",
        current_stock=Decimal("20.000"),
        unit="kg",
        category="Fruits",
    )
    db_session.add(inv_item)
    await db_session.flush()

    stock_intake = StockIntake(
        outlet_id=outlet.id,
        item_id=inv_item.id,
        batch_number="BATCH-ORG-01",
        quantity=Decimal("20.000"),
        remaining_quantity=Decimal("20.000"),
        unit_cost=Decimal("40.00"),
        supplier_id=supplier.id,
        added_by=admin.id,
    )
    db_session.add(stock_intake)
    await db_session.commit()

    # Query Day Book
    res_daybook = await client.get(
        f"/api/analytics/day-book?date={today_str}",
        headers=auth_headers,
    )
    assert res_daybook.status_code == 200
    daybook = res_daybook.json()
    entries = daybook["entries"]
    assert len(entries) >= 4

    # Verify SALE entry has Customer identity
    sale_entries = [e for e in entries if e["entry_type"] == "SALE"]
    assert len(sale_entries) >= 1
    assert sale_entries[0]["entity_name"] == "Alice Customer"
    assert sale_entries[0]["entity_phone"] == "9876543210"
    assert sale_entries[0]["entity_type"] == "CUSTOMER"

    # Verify CUSTOMER_RETURN entry has Customer identity
    return_entries = [e for e in entries if e["entry_type"] == "CUSTOMER_RETURN"]
    assert len(return_entries) >= 1
    assert return_entries[0]["entity_name"] == "Alice Customer"
    assert return_entries[0]["entity_phone"] == "9876543210"
    assert return_entries[0]["entity_type"] == "CUSTOMER"

    # Verify CASH_DEPOSIT entry has Staff identity
    deposit_entries = [e for e in entries if e["entry_type"] == "CASH_DEPOSIT"]
    assert len(deposit_entries) >= 1
    assert deposit_entries[0]["entity_name"] == "Cashier Bob"
    assert deposit_entries[0]["entity_phone"] == "9876500001"
    assert deposit_entries[0]["entity_type"] == "STAFF"

    # Verify STOCK_INTAKE entry has Supplier identity
    intake_entries = [e for e in entries if e["entry_type"] == "STOCK_INTAKE"]
    assert len(intake_entries) >= 1
    assert intake_entries[0]["entity_name"] == "Fresh Valley Farms"
    assert intake_entries[0]["entity_phone"] == "9123456789"
    assert intake_entries[0]["entity_type"] == "SUPPLIER"
    assert intake_entries[0]["reference_number"] == "BATCH-ORG-01"
