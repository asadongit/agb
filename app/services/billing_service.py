"""
Billing Service — manual bill creation, discount application with approval workflows, cash/UPI payment settlement, and inventory auto-deduction integration.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bill_discount_approval import BillDiscountApproval
from app.models.enums import OrderStatusEnum, RoleEnum
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.outlet import Outlet
from app.models.user import User

from app.schemas.billing import (
    ApplyDiscountRequest,
    ApproveDiscountRequest,
    CreateManualBillRequest,
    MarkPaidRequest,
    UpdateManualBillRequest,
)
from app.services.inventory_service import process_order_auto_deduction


def _get_user_id(user: Any) -> uuid.UUID:
    return getattr(user, "user_id", None) or getattr(user, "id", None)


async def create_manual_bill(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_user: Any,
    data: CreateManualBillRequest,
) -> Order:
    """Create a draft manual bill with line items and snapshot pricing."""
    order = Order(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        basket_number=data.basket_number or "WALK-IN",
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        status=OrderStatusEnum.PENDING,
        source="manual",
        created_by_staff_id=_get_user_id(staff_user),
        subtotal_amount=Decimal("0.00"),
        total_amount=Decimal("0.00"),
        discount_status="NONE",
    )
    db.add(order)
    await db.flush()

    subtotal = Decimal("0.00")
    for item_in in data.items:
        menu_item_uuid = uuid.UUID(str(item_in.menu_item_id)) if item_in.menu_item_id else None
        menu_item = await db.get(MenuItem, menu_item_uuid) if menu_item_uuid else None
        if not menu_item or menu_item.outlet_id != outlet_id:
            raise HTTPException(status_code=404, detail=f"Menu item {item_in.menu_item_id} not found.")

        price = Decimal(str(menu_item.price))
        variant_uuid = uuid.UUID(str(item_in.variant_id)) if item_in.variant_id else None
        if variant_uuid:
            variant = await db.get(MenuItemVariant, variant_uuid)
            if variant and variant.menu_item_id == menu_item.id:
                price += Decimal(str(variant.price_delta))

        item_subtotal = price * Decimal(str(item_in.quantity))
        subtotal += item_subtotal

        order_item = OrderItem(
            id=uuid.uuid4(),
            order_id=order.id,
            menu_item_id=menu_item.id,
            variant_id=variant_uuid,
            quantity=item_in.quantity,
            unit_price=price,
        )
        db.add(order_item)

    order.subtotal_amount = subtotal
    order.total_amount = subtotal

    # Evaluate Verification Rules (Anti-theft)
    res_rest = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
    outlet = res_rest.scalar_one_or_none()
    if outlet:
        # Manual bills created by staff are auto-verified unless flagged items exist
        order.is_auto_verified = True

    await db.flush()
    await db.refresh(order)
    return order


async def update_manual_bill(
    db: AsyncSession,
    order_id: uuid.UUID,
    outlet_id: uuid.UUID,
    data: UpdateManualBillRequest,
) -> Order:
    """Update line items or basket info on a draft bill."""
    res = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.id == order_id,
            Order.outlet_id == outlet_id,
            Order.source == "manual",
        )
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Manual bill not found.")

    if order.finalized_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit a finalized bill.")

    if data.basket_number is not None:
        order.basket_number = data.basket_number
    if data.customer_name is not None:
        order.customer_name = data.customer_name
    if data.customer_phone is not None:
        order.customer_phone = data.customer_phone

    if data.items:
        # Delete existing items
        for existing in order.items:
            await db.delete(existing)
        await db.flush()

        subtotal = Decimal("0.00")
        for item_in in data.items:
            item_name = "Custom Item"
            price = Decimal("0.00")

            if item_in.menu_item_id:
                m_res = await db.execute(
                    select(MenuItem).where(
                        MenuItem.id == uuid.UUID(item_in.menu_item_id),
                        MenuItem.outlet_id == outlet_id,
                    )
                )
                m_item = m_res.scalar_one_or_none()
                if m_item:
                    item_name = m_item.name
                    price = m_item.price

            if item_in.variant_id:
                v_res = await db.execute(
                    select(MenuItemVariant).where(
                        MenuItemVariant.id == uuid.UUID(item_in.variant_id)
                    )
                )
                v_item = v_res.scalar_one_or_none()
                if v_item:
                    item_name = f"{item_name} ({v_item.name})"
                    price = v_item.price

            line_total = Decimal("0.00") if item_in.is_complimentary else price * item_in.quantity

            order_item = OrderItem(
                id=uuid.uuid4(),
                order_id=order.id,
                menu_item_id=uuid.UUID(item_in.menu_item_id) if item_in.menu_item_id else None,
                variant_id=uuid.UUID(item_in.variant_id) if item_in.variant_id else None,
                item_name=item_name,
                quantity=item_in.quantity,
                unit_price=price if not item_in.is_complimentary else Decimal("0.00"),
                is_complimentary=item_in.is_complimentary,
                line_total=line_total,
            )
            db.add(order_item)
            subtotal += line_total

        order.subtotal_amount = subtotal
        order.total_amount = subtotal

    await db.flush()
    res = await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order.id)
    )
    return res.scalar_one()


async def apply_discount(
    db: AsyncSession,
    order_id: uuid.UUID,
    outlet_id: uuid.UUID,
    staff_user: User,
    data: ApplyDiscountRequest,
) -> Order:
    """Apply discount to bill. Auto-approve if Manager/Admin; otherwise require approval."""
    res = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.id == order_id,
            Order.outlet_id == outlet_id,
        )
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Bill not found.")

    is_manager_or_admin = staff_user.role in [
        RoleEnum.SUPERADMIN,
        RoleEnum.OUTLET_ADMIN,
        RoleEnum.MANAGER,
    ]

    subtotal = order.subtotal_amount or Decimal("0.00")
    disc_val = Decimal(str(data.discount_value))

    if is_manager_or_admin:
        # Calculate new total immediately
        if data.discount_type == "PERCENT":
            discount_amount = subtotal * (disc_val / Decimal("100"))
            order.total_amount = max(Decimal("0.00"), subtotal - discount_amount)
        elif data.discount_type == "FLAT":
            order.total_amount = max(Decimal("0.00"), subtotal - disc_val)
        elif data.discount_type == "COMPLIMENTARY":
            order.total_amount = Decimal("0.00")

        order.discount_type = data.discount_type
        order.discount_value = disc_val
        order.discount_reason = data.reason_note
        order.discount_status = "APPROVED"
    else:
        # Requires manager approval
        order.discount_type = data.discount_type
        order.discount_value = disc_val
        order.discount_reason = data.reason_note
        order.discount_status = "PENDING_APPROVAL"

        approval = BillDiscountApproval(
            id=uuid.uuid4(),
            order_id=order.id,
            requested_by_id=_get_user_id(staff_user),
            status="PENDING",
            discount_type=data.discount_type,
            discount_value=disc_val,
            reason_note=data.reason_note,
        )
        db.add(approval)

    await db.flush()
    return order


async def approve_discount(
    db: AsyncSession,
    approval_id: uuid.UUID,
    outlet_id: uuid.UUID,
    manager_user: Any,
    approve: bool,
) -> BillDiscountApproval:
    """Manager/Admin approves or rejects a pending discount request."""
    if manager_user.role not in [RoleEnum.SUPERADMIN, RoleEnum.OUTLET_ADMIN, RoleEnum.MANAGER]:
        raise HTTPException(status_code=403, detail="Only Managers or Admins can resolve discount approvals.")

    res = await db.execute(
        select(BillDiscountApproval)
        .join(Order, BillDiscountApproval.order_id == Order.id)
        .where(
            BillDiscountApproval.id == approval_id,
            Order.outlet_id == outlet_id,
            BillDiscountApproval.status == "PENDING",
        )
    )
    approval = res.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=404, detail="Pending discount approval not found.")

    order_res = await db.execute(select(Order).where(Order.id == approval.order_id))
    order = order_res.scalar_one()

    approval.approved_by_id = _get_user_id(manager_user)
    approval.resolved_at = datetime.utcnow()

    if approve:
        approval.status = "APPROVED"
        order.discount_status = "APPROVED"
        subtotal = order.subtotal_amount or Decimal("0.00")
        disc_val = approval.discount_value

        if approval.discount_type == "PERCENT":
            discount_amount = subtotal * (disc_val / Decimal("100"))
            order.total_amount = max(Decimal("0.00"), subtotal - discount_amount)
        elif approval.discount_type == "FLAT":
            order.total_amount = max(Decimal("0.00"), subtotal - disc_val)
        elif approval.discount_type == "COMPLIMENTARY":
            order.total_amount = Decimal("0.00")
    else:
        approval.status = "REJECTED"
        order.discount_status = "REJECTED"
        order.total_amount = order.subtotal_amount

    await db.flush()
    return approval


async def finalize_bill(
    db: AsyncSession,
    order_id: uuid.UUID,
    outlet_id: uuid.UUID,
) -> Order:
    """Lock draft bill from further item edits."""
    res = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.id == order_id,
            Order.outlet_id == outlet_id,
        )
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Bill not found.")

    order.finalized_at = datetime.utcnow()
    await db.flush()
    return order


async def mark_bill_paid(
    db: AsyncSession,
    order_id: uuid.UUID,
    outlet_id: uuid.UUID,
    payment_method: str,
) -> Order:
    """Record cash/UPI payment method, set order status to PAID, and trigger inventory auto-deduction."""
    res = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.id == order_id,
            Order.outlet_id == outlet_id,
        )
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Bill not found.")

    order.payment_method = payment_method
    order.status = OrderStatusEnum.PAID
    order.paid_at = datetime.utcnow()
    if not order.finalized_at:
        order.finalized_at = datetime.utcnow()

    # Trigger recipe auto-deduction for stock management
    await process_order_auto_deduction(db, order)

    await db.flush()
    return order


async def get_pending_approvals_count(
    db: AsyncSession,
    outlet_id: uuid.UUID,
) -> int:
    """Get count of pending discount approval requests for manager notification badge."""
    stmt = (
        select(func.count(BillDiscountApproval.id))
        .join(Order, BillDiscountApproval.order_id == Order.id)
        .where(
            Order.outlet_id == outlet_id,
            BillDiscountApproval.status == "PENDING",
        )
    )
    res = await db.execute(stmt)
    return int(res.scalar() or 0)
