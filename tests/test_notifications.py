"""
Unit & Integration tests for the Notification Engine, Near-Expiry Thresholds, and Channel Dispatchers.
"""

import pytest
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import NotificationTypeEnum, PaymentModeEnum, RoleEnum
from app.models.outlet import Outlet
from app.models.user import User
from app.models.inventory_item import InventoryItem
from app.models.stock_intake import StockIntake
from app.services.notification_service import (
    sync_near_expiry_notifications,
    get_outlet_notifications,
    mark_notification_as_read,
    dispatch_notification_channels,
)


@pytest.mark.asyncio
async def test_notification_engine_and_threshold(db_session: AsyncSession):
    db = db_session
    # 1. Create test outlet with custom threshold (e.g. 10 days)
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Test Notification Outlet",
        slug=f"test-notif-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
        near_expiry_threshold_days=10,
        notification_email="testadmin@apnagreenbasket.com",
        phone="9876543210",
    )
    db.add(outlet)

    # 2. Create test admin user
    user = User(
        id=uuid.uuid4(),
        email="testadmin@apnagreenbasket.com",
        password_hash="hashedpass",
        role=RoleEnum.OUTLET_ADMIN,
        outlet_id=outlet_id,
    )
    db.add(user)

    # 3. Create test inventory item
    item_id = uuid.uuid4()
    item = InventoryItem(
        id=item_id,
        outlet_id=outlet_id,
        name="Test Expiring Dairy Milk",
        category="Dairy",
        unit="pcs",
        barcode="8901234567890",
        cost_per_unit=50.0,
        mrp=60.0,
    )
    db.add(item)
    await db.commit()

    # 4. Create intake batch expiring in 4 days (within 10 days threshold)
    now = datetime.now(timezone.utc)
    intake = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item_id,
        batch_number="BAT-EXP-001",
        supplier_name="Amul Dairy Supplier",
        quantity=100,
        initial_quantity=100,
        remaining_quantity=45,
        unit_cost=50.0,
        expiry_date=now + timedelta(days=4),
    )
    db.add(intake)
    await db.commit()

    # 5. Test syncing notifications
    await sync_near_expiry_notifications(db, outlet_id)

    # 6. Fetch notifications
    result = await get_outlet_notifications(db, outlet_id)
    assert result["unread_count"] == 1
    assert result["threshold_days"] == 10
    assert len(result["notifications"]) == 1

    notif = result["notifications"][0]
    assert notif.type == NotificationTypeEnum.NEAR_EXPIRY
    assert "Test Expiring Dairy Milk" in notif.title
    assert notif.details["batch_number"] == "BAT-EXP-001"
    assert notif.details["supplier_name"] == "Amul Dairy Supplier"
    assert notif.details["days_until_expiry"] == 4

    # 7. Mark as read
    read_notif = await mark_notification_as_read(db, notif.id, outlet_id)
    assert read_notif is not None
    assert read_notif.is_read is True

    # 8. Test Channel Dispatch
    dispatch_res = await dispatch_notification_channels(db, notif.id, outlet_id)
    assert dispatch_res["status"] == "SUCCESS"
    assert "EMAIL" in dispatch_res["dispatched_channels"]
    assert "WHATSAPP" in dispatch_res["dispatched_channels"]
    assert dispatch_res["recipient_email"] == "testadmin@apnagreenbasket.com"
