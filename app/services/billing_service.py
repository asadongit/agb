"""
Billing Service — manual bill creation, discount application with approval workflows, cash/UPI payment settlement, and inventory auto-deduction integration.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bill_discount_approval import BillDiscountApproval
from app.models.customer_return import CustomerReturn
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
    # Auto-register / link Customer account if phone number provided
    if data.customer_phone and data.customer_phone.strip():
        from app.services.customer_service import create_customer
        await create_customer(
            db,
            outlet_id,
            name=data.customer_name or "POS Customer",
            phone=data.customer_phone,
        )

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
    total_tax = Decimal("0.00")

    # Fetch outlet's evening price toggle once
    from app.models.outlet import Outlet as OutletModel
    _outlet_result = await db.execute(select(OutletModel.evening_price_active).where(OutletModel.id == outlet_id))
    _evening_active = _outlet_result.scalar_one_or_none() or False

    for item_in in data.items:
        menu_item_uuid = uuid.UUID(str(item_in.menu_item_id)) if item_in.menu_item_id else None
        menu_item = await db.get(MenuItem, menu_item_uuid) if menu_item_uuid else None
        if not menu_item or menu_item.outlet_id != outlet_id:
            raise HTTPException(status_code=404, detail=f"Menu item {item_in.menu_item_id} not found.")

        # Determine price based on custom unit_price, WHOLESALE pricing_type, or standard RETAIL price
        if item_in.unit_price is not None:
            price = Decimal(str(item_in.unit_price))
        elif getattr(item_in, "pricing_type", "RETAIL") == "WHOLESALE" and menu_item.wholesale_price is not None:
            price = Decimal(str(menu_item.wholesale_price))
        else:
            price = Decimal(str(menu_item.resolve_price(_evening_active)))

        variant_uuid = uuid.UUID(str(item_in.variant_id)) if item_in.variant_id else None
        if variant_uuid:
            variant = await db.get(MenuItemVariant, variant_uuid)
            if variant and variant.menu_item_id == menu_item.id:
                price += Decimal(str(variant.price_delta))

        # MRP & Tax rate from product catalog or input
        item_mrp = Decimal(str(item_in.mrp)) if item_in.mrp is not None else (menu_item.mrp or price)
        item_tax_rate = Decimal(str(item_in.tax_rate)) if item_in.tax_rate is not None else (menu_item.tax_rate or Decimal("0.00"))

        item_subtotal = price * Decimal(str(item_in.quantity))
        item_tax = item_subtotal * (item_tax_rate / Decimal("100")) if not item_in.is_complimentary else Decimal("0.00")

        subtotal += item_subtotal
        total_tax += item_tax

        final_item_name = item_in.item_name or (menu_item.name if menu_item else "Item")
        order_item = OrderItem(
            id=uuid.uuid4(),
            order_id=order.id,
            menu_item_id=menu_item.id if menu_item else None,
            variant_id=variant_uuid,
            item_name=final_item_name,
            quantity=item_in.quantity,
            unit_price=price if not item_in.is_complimentary else Decimal("0.00"),
            mrp=item_mrp,
            tax_rate=item_tax_rate,
            tax_category=menu_item.tax_category or "GST 0%",
            is_complimentary=item_in.is_complimentary,
            line_total=item_subtotal if not item_in.is_complimentary else Decimal("0.00"),
        )
        db.add(order_item)

    order.subtotal_amount = subtotal
    order.tax_amount = total_tax.quantize(Decimal("0.01"))
    order.total_amount = subtotal

    # Evaluate Verification Rules (Anti-theft)
    res_rest = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
    outlet = res_rest.scalar_one_or_none()
    if outlet:
        # Manual bills created by staff are auto-verified
        order.is_auto_verified = True

    await db.flush()
    res_final = await db.execute(
        select(Order).where(Order.id == order.id).options(selectinload(Order.items))
    )
    return res_final.scalar_one()


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
        total_tax = Decimal("0.00")
        for item_in in data.items:
            menu_item_uuid = uuid.UUID(str(item_in.menu_item_id)) if item_in.menu_item_id else None
            menu_item = await db.get(MenuItem, menu_item_uuid) if menu_item_uuid else None

            if item_in.unit_price is not None:
                price = Decimal(str(item_in.unit_price))
            elif menu_item:
                if getattr(item_in, "pricing_type", "RETAIL") == "WHOLESALE" and menu_item.wholesale_price is not None:
                    price = Decimal(str(menu_item.wholesale_price))
                else:
                    price = Decimal(str(menu_item.price))
            else:
                price = Decimal("0.00")

            variant_uuid = uuid.UUID(str(item_in.variant_id)) if item_in.variant_id else None
            if variant_uuid and menu_item:
                variant = await db.get(MenuItemVariant, variant_uuid)
                if variant and variant.menu_item_id == menu_item.id:
                    price += Decimal(str(variant.price_delta))

            item_mrp = Decimal(str(item_in.mrp)) if item_in.mrp is not None else ((menu_item.mrp if menu_item else None) or price)
            item_tax_rate = Decimal(str(item_in.tax_rate)) if item_in.tax_rate is not None else ((menu_item.tax_rate if menu_item else None) or Decimal("0.00"))

            item_subtotal = price * Decimal(str(item_in.quantity))
            item_tax = item_subtotal * (item_tax_rate / Decimal("100")) if not item_in.is_complimentary else Decimal("0.00")

            subtotal += item_subtotal
            total_tax += item_tax

            final_item_name = item_in.item_name or (menu_item.name if menu_item else "Item")
            order_item = OrderItem(
                id=uuid.uuid4(),
                order_id=order.id,
                menu_item_id=menu_item.id if menu_item else None,
                variant_id=variant_uuid,
                item_name=final_item_name,
                quantity=item_in.quantity,
                unit_price=price if not item_in.is_complimentary else Decimal("0.00"),
                mrp=item_mrp,
                tax_rate=item_tax_rate,
                tax_category=(menu_item.tax_category if menu_item else None) or "GST 0%",
                is_complimentary=item_in.is_complimentary,
                line_total=item_subtotal if not item_in.is_complimentary else Decimal("0.00"),
            )
            db.add(order_item)

        order.subtotal_amount = subtotal
        gross_total = subtotal

        # Re-apply discount if bill has an approved discount
        if order.discount_status == "APPROVED" and order.discount_type:
            disc_val = order.discount_value or Decimal("0.00")
            if order.discount_type == "PERCENT":
                discount_amount = subtotal * (disc_val / Decimal("100"))
                order.total_amount = max(Decimal("0.00"), subtotal - discount_amount)
            elif order.discount_type == "FLAT":
                order.total_amount = max(Decimal("0.00"), subtotal - disc_val)
            elif order.discount_type == "COMPLIMENTARY":
                order.total_amount = Decimal("0.00")
            else:
                order.total_amount = subtotal
        else:
            order.total_amount = subtotal

        if subtotal > Decimal("0.00") and order.total_amount > Decimal("0.00"):
            ratio = order.total_amount / subtotal
            order.tax_amount = (total_tax * ratio).quantize(Decimal("0.01"))
        else:
            order.tax_amount = Decimal("0.00")

    await db.flush()
    res = await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order.id)
    )
    return res.scalar_one()


def _recalculate_order_tax(order: Order) -> None:
    subtotal = order.subtotal_amount or Decimal("0.00")
    total_amount = order.total_amount or Decimal("0.00")
    if subtotal <= Decimal("0.00") or total_amount <= Decimal("0.00") or not getattr(order, "items", None):
        order.tax_amount = Decimal("0.00")
        return

    base_tax = Decimal("0.00")
    for item in order.items:
        rate = item.tax_rate or Decimal("0.00")
        if rate > Decimal("0.00") and not item.is_complimentary:
            price = item.unit_price or Decimal("0.00")
            qty = Decimal(str(item.quantity)) if item.quantity is not None else Decimal("1.00")
            l_total = price * qty
            base_tax += l_total * (rate / Decimal("100.00"))

    ratio = total_amount / subtotal
    order.tax_amount = (base_tax * ratio).quantize(Decimal("0.01"))


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

    user_role_raw = getattr(staff_user, "role", "")
    user_role_str = (user_role_raw.value if hasattr(user_role_raw, "value") else str(user_role_raw)).upper()
    is_manager_or_admin = any(r in user_role_str for r in ["SUPERADMIN", "ADMIN", "MANAGER", "OWNER"])

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
        _recalculate_order_tax(order)
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

    order_res = await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == approval.order_id)
    )
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
        _recalculate_order_tax(order)
    else:
        approval.status = "REJECTED"
        order.discount_status = "REJECTED"
        order.total_amount = order.subtotal_amount
        _recalculate_order_tax(order)

    await db.flush()
    return approval

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
    cash_denominations: dict[str, int] | None = None,
) -> Order:
    """Record cash/UPI payment method, set order status to COMPLETED for POS bills, and trigger inventory auto-deduction."""
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
    if cash_denominations and payment_method == "CASH":
        order.cash_denominations = cash_denominations
        denom_strs = [f"₹{k}x{v}" for k, v in cash_denominations.items() if v > 0]
        if denom_strs:
            order.payment_reference = f"CASH [{', '.join(denom_strs)}]"
        else:
            order.payment_reference = "CASH"
    elif not order.payment_reference:
        order.payment_reference = payment_method

    # Walk-in POS bills go straight to COMPLETED status without needing manual verification
    order.is_auto_verified = True
    order.status = OrderStatusEnum.COMPLETED
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


async def get_daily_cash_denominations(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    date_str: str | None = None,
) -> dict[str, Any]:
    """
    Get aggregated cash currency denominations collected for a specific date (defaults to today).
    Optimized with SQL date filtering.
    """
    from datetime import datetime, time
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else datetime.now(timezone.utc).date()
    except Exception:
        target_date = datetime.now(timezone.utc).date()

    target_date_str = target_date.strftime("%Y-%m-%d")
    start_dt = datetime.combine(target_date, time.min)
    end_dt = datetime.combine(target_date, time.max)

    stmt = (
        select(Order.cash_denominations, Order.total_amount)
        .where(
            Order.outlet_id == outlet_id,
            Order.payment_method == "CASH",
            func.coalesce(Order.paid_at, Order.created_at) >= start_dt,
            func.coalesce(Order.paid_at, Order.created_at) <= end_dt,
        )
    )
    res = await db.execute(stmt)
    orders = res.all()

    denoms_count = {500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0}
    total_cash_collected = 0.0

    for row in orders:
        total_cash_collected += float(row.total_amount or 0.0)
        cd = row.cash_denominations
        if isinstance(cd, dict):
            for k, v in cd.items():
                try:
                    k_num = int(k)
                    if k_num in denoms_count:
                        denoms_count[k_num] += int(v or 0)
                except (ValueError, TypeError):
                    pass

    return {
        "date": target_date_str,
        "total_cash_collected": total_cash_collected,
        "denominations": {str(k): v for k, v in denoms_count.items()},
        "denomination_subtotals": {str(k): k * v for k, v in denoms_count.items()},
    }


async def process_customer_return(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_user: Any,
    data: Any,
) -> dict[str, Any]:
    """
    Process customer return / exchange for a bill or direct un-billed return.
    Restocks returned items and saves return record to database.
    """
    order: Order | None = None
    customer_name = getattr(data, "customer_name", None)
    customer_phone = getattr(data, "customer_phone", None)
    original_bill_number = None

    if getattr(data, "order_id", None):
        order_uuid = uuid.UUID(data.order_id)
        order_res = await db.execute(
            select(Order).options(selectinload(Order.items)).where(
                Order.id == order_uuid,
                Order.outlet_id == outlet_id,
            )
        )
        order = order_res.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Original bill not found.")

        if order.status not in [OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED]:
            raise HTTPException(
                status_code=400,
                detail="Cannot process return on un-paid or un-finalized bill."
            )
        customer_name = customer_name or order.customer_name
        customer_phone = customer_phone or order.customer_phone
        original_bill_number = f"#{order.id.hex[:8].upper()}"

    total_return_amount = Decimal("0.00")
    returned_items_summary = []

    for ret_item in data.return_items:
        ret_qty = Decimal(str(ret_item.quantity))
        item_unit_price = Decimal("0.00")
        item_name = ret_item.item_name or "Returned Item"
        menu_item_id = ret_item.menu_item_id

        if order and ret_item.order_item_id:
            item_uuid = uuid.UUID(ret_item.order_item_id)
            matching = next((i for i in order.items if i.id == item_uuid), None)
            if matching:
                item_unit_price = matching.unit_price or Decimal("0.00")
                item_name = matching.item_name or item_name
                menu_item_id = menu_item_id or (str(matching.menu_item_id) if matching.menu_item_id else None)
        elif ret_item.unit_price is not None:
            item_unit_price = Decimal(str(ret_item.unit_price))

        line_refund = item_unit_price * ret_qty
        total_return_amount += line_refund

        returned_items_summary.append({
            "order_item_id": ret_item.order_item_id,
            "menu_item_id": menu_item_id,
            "item_name": item_name,
            "quantity": float(ret_qty),
            "unit_price": float(item_unit_price),
            "line_refund": float(line_refund),
            "reason": ret_item.reason or "CUSTOMER_RETURN",
        })

        # Restock inventory item and original intake batch if linked to a MenuItem
        if menu_item_id:
            try:
                m_item = await db.get(MenuItem, uuid.UUID(menu_item_id))
                if m_item and m_item.inventory_item_id:
                    from app.services.inventory_service import restore_customer_return_to_batch
                    await restore_customer_return_to_batch(
                        db=db,
                        outlet_id=outlet_id,
                        item_id=m_item.inventory_item_id,
                        return_qty=ret_qty,
                        order_id=order.id if order else None,
                    )
            except Exception as e:
                print(f"⚠️ [Customer Return Restock Error] {e}")

    net_balance = float(total_return_amount)
    return_num = f"RET-{uuid.uuid4().hex[:6].upper()}"

    # Save to CustomerReturn table
    customer_return_rec = CustomerReturn(
        return_number=return_num,
        outlet_id=outlet_id,
        order_id=order.id if order else None,
        customer_name=customer_name,
        customer_phone=customer_phone,
        returned_items=returned_items_summary,
        total_refund_amount=total_return_amount,
        refund_payment_method=data.refund_payment_method or "CASH",
        notes=data.notes,
    )
    db.add(customer_return_rec)
    await db.flush()

    return {
        "id": str(customer_return_rec.id),
        "status": "PROCESSED",
        "return_number": return_num,
        "order_id": str(order.id) if order else None,
        "original_bill_number": original_bill_number or "Direct Return (No Bill)",
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "total_refund_amount": float(total_return_amount),
        "net_balance": net_balance,
        "returned_items": returned_items_summary,
        "refund_payment_method": data.refund_payment_method or "CASH",
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }


async def list_customer_returns(db: AsyncSession, outlet_id: uuid.UUID) -> list[dict[str, Any]]:
    """List all past customer return bills for an outlet."""
    res = await db.execute(
        select(CustomerReturn)
        .options(selectinload(CustomerReturn.order))
        .where(CustomerReturn.outlet_id == outlet_id)
        .order_by(CustomerReturn.created_at.desc())
    )
    returns_list = res.scalars().all()
    out = []
    for ret in returns_list:
        orig_bill = f"#{ret.order.id.hex[:8].upper()}" if ret.order else "Direct Return (No Bill)"
        out.append({
            "id": str(ret.id),
            "return_number": ret.return_number,
            "order_id": str(ret.order_id) if ret.order_id else None,
            "original_bill_number": orig_bill,
            "customer_name": ret.customer_name,
            "customer_phone": ret.customer_phone,
            "returned_items": ret.returned_items,
            "total_refund_amount": float(ret.total_refund_amount),
            "net_balance": float(ret.total_refund_amount),
            "refund_payment_method": ret.refund_payment_method,
            "notes": ret.notes,
            "created_at": ret.created_at.isoformat() if ret.created_at else datetime.now(timezone.utc).isoformat(),
        })
    return out


async def discard_draft_bill(db: AsyncSession, bill_id: uuid.UUID, outlet_id: uuid.UUID) -> None:
    """Discard/delete a draft or pending bill when canceled without explicitly saving as draft."""
    res = await db.execute(
        select(Order).where(Order.id == bill_id, Order.outlet_id == outlet_id)
    )
    order = res.scalar_one_or_none()
    if order and order.status not in [OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED, "PAID", "COMPLETED"]:
        # Delete any pending discount approvals first to avoid FK constraint error
        await db.execute(
            delete(BillDiscountApproval).where(BillDiscountApproval.order_id == order.id)
        )
        await db.delete(order)
        await db.flush()
