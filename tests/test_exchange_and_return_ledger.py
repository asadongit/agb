"""
Tests for Exchange Logic, Return Ledger, Daybook Exchange Sales, and Outlet Earnings Returns Deduction.
"""

from datetime import datetime, timezone
from decimal import Decimal
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.enums import OrderStatusEnum, RoleEnum
from app.models.order import Order
from app.models.customer_return import CustomerReturn
from app.models.menu_item import MenuItem
from tests.conftest import (
    create_test_outlet,
    create_test_user,
    create_test_category,
    create_test_menu_item,
    get_auth_headers,
)


@pytest.mark.asyncio
async def test_exchange_flow_order_creation_and_analytics(client: AsyncClient, db_session):
    # 1. Setup outlet, admin, and a menu item for exchange
    outlet = await create_test_outlet(db_session)
    admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
    category = await create_test_category(db_session, outlet, name="Fruits")

    exchange_item = await create_test_menu_item(
        db_session,
        outlet,
        category,
        name="Fresh Apple",
        price=Decimal("120.00"),
        is_available=True,
    )
    await db_session.commit()

    admin_auth_headers = get_auth_headers(admin, outlet)

    # 2. Process return with exchange item
    # Returned item: 1x Old Item @ 150
    # Exchange item: 1x Fresh Apple @ 120
    # Net refund = 150 - 120 = 30
    return_payload = {
        "order_id": None,
        "customer_name": "Ravi Kumar",
        "customer_phone": "9876543210",
        "return_items": [
            {
                "menu_item_id": None,
                "item_name": "Old Damaged Mango",
                "quantity": 1.0,
                "unit_price": 150.0,
                "reason": "DEFECTIVE_PRODUCT",
            }
        ],
        "exchange_items": [
            {
                "menu_item_id": str(exchange_item.id),
                "item_name": "Fresh Apple",
                "quantity": 1.0,
                "unit_price": 120.0,
                "selected_unit": "kg",
            }
        ],
        "refund_payment_method": "CASH",
        "notes": "Exchange damaged mango for apple",
    }

    res = await client.post(
        "/api/billing/returns",
        json=return_payload,
        headers=admin_auth_headers,
    )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()

    assert data["status"] == "PROCESSED"
    assert data["total_refund_amount"] == 30.0  # Net refund: 150 - 120 = 30
    assert data["total_exchange_amount"] == 120.0
    assert data["exchange_order_id"] is not None
    assert len(data["exchange_items"]) == 1
    assert data["exchange_items"][0]["item_name"] == "Fresh Apple"

    # 3. Verify real Order created for exchange items
    exc_order_id = uuid.UUID(data["exchange_order_id"])
    ord_res = await db_session.execute(
        select(Order).where(Order.id == exc_order_id)
    )
    exc_order = ord_res.scalar_one_or_none()
    assert exc_order is not None
    assert exc_order.source == "EXCHANGE"
    assert exc_order.status == OrderStatusEnum.COMPLETED
    assert float(exc_order.total_amount) == 120.0
    assert exc_order.paid_at is not None

    # Verify CustomerReturn record in DB
    ret_res = await db_session.execute(
        select(CustomerReturn).where(CustomerReturn.id == uuid.UUID(data["id"]))
    )
    ret_rec = ret_res.scalar_one_or_none()
    assert ret_rec is not None
    assert ret_rec.exchange_order_id == exc_order_id
    assert float(ret_rec.total_exchange_amount) == 120.0
    assert len(ret_rec.exchange_items) == 1

    # 4. Test Daybook contains EXCHANGE_SALE and CUSTOMER_RETURN
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    res_db = await client.get(
        f"/api/analytics/day-book?date={today_str}",
        headers=admin_auth_headers,
    )
    assert res_db.status_code == 200, f"Daybook failed: {res_db.text}"
    daybook = res_db.json()
    entry_types = [e["entry_type"] for e in daybook["entries"]]
    assert "EXCHANGE_SALE" in entry_types
    assert "CUSTOMER_RETURN" in entry_types

    exc_entry = next(e for e in daybook["entries"] if e["entry_type"] == "EXCHANGE_SALE")
    assert exc_entry["credit"] == 120.0
    assert "Exchange Sale" in exc_entry["description"]

    # 5. Test Outlet Earnings includes total_customer_returns and deducts it
    from_date = f"{today_str}T00:00:00"
    to_date = f"{today_str}T23:59:59"
    res_earn = await client.get(
        f"/api/analytics/outlet-earnings?from_date={from_date}&to_date={to_date}",
        headers=admin_auth_headers,
    )
    assert res_earn.status_code == 200, f"Outlet earnings failed: {res_earn.text}"
    earnings = res_earn.json()
    assert "total_customer_returns" in earnings
    assert earnings["total_customer_returns"] == 30.0  # refund amount recorded
    # Gross revenue includes the 120 exchange sale
    assert earnings["gross_revenue"] >= 120.0
    # Net drawer earnings formula: gross (120) - customer_returns (30) = 90
    assert earnings["net_drawer_earnings"] == earnings["gross_revenue"] - earnings["total_customer_returns"]

    # 6. Test Customer Returns Analytics contains return_ledger and all returned items
    res_ret_analytics = await client.get(
        f"/api/analytics/customer-returns?from_date={from_date}&to_date={to_date}",
        headers=admin_auth_headers,
    )
    assert res_ret_analytics.status_code == 200, f"Customer return analytics failed: {res_ret_analytics.text}"
    ret_analytics = res_ret_analytics.json()
    assert "return_ledger" in ret_analytics
    assert len(ret_analytics["return_ledger"]) >= 1
    ledger_item = ret_analytics["return_ledger"][0]
    assert ledger_item["item_name"] == "Old Damaged Mango"
    assert ledger_item["quantity"] == 1.0
    assert ledger_item["unit_price"] == 150.0
    assert ledger_item["line_refund"] == 150.0
    assert ledger_item["customer_name"] == "Ravi Kumar"
    assert ledger_item["return_number"].startswith("RET-")

    # Verify top_returned_items includes the returned item
    item_names = [it["item_name"] for it in ret_analytics["top_returned_items"]]
    assert "Old Damaged Mango" in item_names
