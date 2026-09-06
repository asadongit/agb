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
from app.services.outbox_service import append_to_outbox
from app.models.customer_ledger import CustomerLedger


def _get_user_id(user: Any) -> uuid.UUID:
    return getattr(user, "user_id", None) or getattr(user, "id", None)


async def create_manual_bill(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_user: Any,
    data: CreateManualBillRequest,
    order_id: uuid.UUID | None = None,
) -> Order:
    """Create a draft manual bill with line items and snapshot pricing."""
    # Auto-register / link Customer account if phone number provided
    cust_id = None
    if data.customer_phone and data.customer_phone.strip():
        from app.services.customer_service import create_customer
        cust = await create_customer(
            db,
            outlet_id,
            name=data.customer_name or "POS Customer",
            phone=data.customer_phone,
            extra_detail=data.customer_extra_detail,
        )
        cust_id = cust.id

    replaces_bill_uuid = None
    if getattr(data, "replaces_bill_id", None):
        try:
            replaces_bill_uuid = uuid.UUID(data.replaces_bill_id)
        except Exception as e:
            print(f"Invalid replaces_bill_id: {e}")

    order = Order(
        id=order_id or uuid.uuid4(),
        outlet_id=outlet_id,
        basket_number=data.basket_number or "WALK-IN",
        customer_id=cust_id,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        status=OrderStatusEnum.PENDING,
        source="manual",
        created_by_staff_id=_get_user_id(staff_user),
        replaces_bill_id=replaces_bill_uuid,
        subtotal_amount=Decimal("0.00"),
        total_amount=Decimal("0.00"),
        discount_status="NONE",
    )
    
    # Inherit discount if replacing a bill
    if replaces_bill_uuid:
        old_order = await db.get(Order, replaces_bill_uuid)
        if old_order and old_order.discount_status == "APPROVED" and old_order.discount_type:
            order.discount_status = "APPROVED"
            order.discount_reason = old_order.discount_reason or "Inherited from edited bill"
            order.discount_approved_by = old_order.discount_approved_by
            if old_order.discount_type == "PERCENT" or old_order.discount_type.startswith("COMPLIMENTARY"):
                order.discount_type = old_order.discount_type
                order.discount_value = old_order.discount_value
            elif old_order.discount_type == "FLAT":
                # Convert FLAT to PERCENT proportionally based on old subtotal
                old_sub = float(old_order.subtotal_amount or 0)
                old_val = float(old_order.discount_value or 0)
                if old_sub > 0:
                    order.discount_type = "PERCENT"
                    order.discount_value = Decimal(str(round((old_val / old_sub) * 100, 2)))
    
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
            w_price = Decimal(str(menu_item.wholesale_price))
            if menu_item.is_on_offer and menu_item.offer_price is not None and menu_item.offer_price > Decimal("0.00"):
                price = min(w_price, menu_item.offer_price)
            else:
                price = w_price
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
    order.total_amount = subtotal

    # Apply inherited discount if present
    if order.discount_status == "APPROVED" and order.discount_type:
        disc_val = order.discount_value or Decimal("0.00")
        if order.discount_type == "PERCENT":
            discount_amount = subtotal * (disc_val / Decimal("100"))
            order.total_amount = max(Decimal("0.00"), subtotal - discount_amount)
        elif order.discount_type == "FLAT":
            order.total_amount = max(Decimal("0.00"), subtotal - disc_val)
        elif order.discount_type == "COMPLIMENTARY":
            order.total_amount = Decimal("0.00")

    if subtotal > Decimal("0.00") and order.total_amount > Decimal("0.00"):
        ratio = order.total_amount / subtotal
        order.tax_amount = (total_tax * ratio).quantize(Decimal("0.01"))
    else:
        order.tax_amount = Decimal("0.00")

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
    final_order = res_final.scalar_one()

    # OUTBOX: Queue action for cloud sync if local
    append_to_outbox(
        db,
        action_type="bill_created",
        payload={
            "local_order_id": str(final_order.id),
            "staff_id": str(_get_user_id(staff_user)),
            "bill_data": data.model_dump(mode="json"),
        }
    )

    return final_order


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

    if data.customer_phone and data.customer_phone.strip():
        from app.services.customer_service import create_customer
        cust = await create_customer(
            db,
            outlet_id,
            name=data.customer_name or order.customer_name or "POS Customer",
            phone=data.customer_phone,
            extra_detail=getattr(data, "customer_extra_detail", None),
        )
        order.customer_id = cust.id
        order.customer_phone = cust.phone
        order.customer_name = cust.name
    elif data.customer_phone == "":
        order.customer_id = None
        order.customer_phone = None
        order.customer_name = None
    elif data.customer_name is not None:
        order.customer_name = data.customer_name

    if data.items:
        # Delete existing items
        for existing in order.items:
            await db.delete(existing)
        await db.flush()

        # Fetch outlet's evening price toggle once
        from app.models.outlet import Outlet as OutletModel
        _outlet_result = await db.execute(select(OutletModel.evening_price_active).where(OutletModel.id == outlet_id))
        _evening_active = _outlet_result.scalar_one_or_none() or False

        subtotal = Decimal("0.00")
        total_tax = Decimal("0.00")
        for item_in in data.items:
            menu_item_uuid = uuid.UUID(str(item_in.menu_item_id)) if item_in.menu_item_id else None
            menu_item = await db.get(MenuItem, menu_item_uuid) if menu_item_uuid else None

            if item_in.unit_price is not None:
                price = Decimal(str(item_in.unit_price))
            elif menu_item:
                if getattr(item_in, "pricing_type", "RETAIL") == "WHOLESALE" and menu_item.wholesale_price is not None:
                    w_price = Decimal(str(menu_item.wholesale_price))
                    if menu_item.is_on_offer and menu_item.offer_price is not None and menu_item.offer_price > Decimal("0.00"):
                        price = min(w_price, menu_item.offer_price)
                    else:
                        price = w_price
                else:
                    price = Decimal(str(menu_item.resolve_price(_evening_active)))
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


def _apply_item_level_complimentary(db: AsyncSession, order: Order, item_quantities: dict) -> None:
    """Helper to apply partial or full complimentary flags to specific order items."""
    for item in list(order.items):
        item_id_str = str(item.id)
        if item_id_str in item_quantities:
            comp_qty = Decimal(str(item_quantities[item_id_str]))
            if comp_qty <= Decimal("0.00"):
                continue
            
            current_qty = Decimal(str(item.quantity)) if item.quantity is not None else Decimal("1.00")
            
            if comp_qty >= current_qty:
                item.is_complimentary = True
                item.line_total = Decimal("0.00")
            else:
                # Split item
                paid_qty = current_qty - comp_qty
                
                # Update existing item to paid portion
                item.quantity = float(paid_qty)
                item.line_total = (item.unit_price or Decimal("0.00")) * paid_qty
                
                # Create complimentary portion
                from app.models.order_item import OrderItem
                import uuid
                new_item = OrderItem(
                    id=uuid.uuid4(),
                    order_id=order.id,
                    menu_item_id=item.menu_item_id,
                    variant_id=item.variant_id,
                    item_name=item.item_name,
                    quantity=float(comp_qty),
                    unit_price=item.unit_price,
                    mrp=item.mrp,
                    tax_rate=item.tax_rate,
                    tax_category=item.tax_category,
                    is_complimentary=True,
                    line_total=Decimal("0.00")
                )
                db.add(new_item)
                order.items.append(new_item)
    
    # Recalculate totals
    paid_subtotal = sum(i.line_total for i in order.items if not i.is_complimentary and i.line_total)
    order.discount_value = (order.subtotal_amount or Decimal("0.00")) - paid_subtotal
    order.total_amount = paid_subtotal


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

    subtotal = order.subtotal_amount or order.total_amount or Decimal("0.00")
    disc_val = Decimal(str(data.discount_value))

    if is_manager_or_admin:
        # Calculate new total immediately
        if data.discount_type == "PERCENT":
            discount_amount = subtotal * (disc_val / Decimal("100"))
            order.total_amount = max(Decimal("0.00"), subtotal - discount_amount)
            order.discount_value = disc_val
        elif data.discount_type == "FLAT":
            order.total_amount = max(Decimal("0.00"), subtotal - disc_val)
            order.discount_value = disc_val
        elif data.discount_type == "COMPLIMENTARY":
            order.total_amount = Decimal("0.00")
            order.discount_value = subtotal
        elif data.discount_type == "COMPLIMENTARY_ITEMS" and data.item_complimentary_quantities:
            _apply_item_level_complimentary(db, order, data.item_complimentary_quantities)

        order.discount_type = data.discount_type
        if data.discount_type != "COMPLIMENTARY_ITEMS":
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
            complimentary_items=data.item_complimentary_quantities if data.discount_type == "COMPLIMENTARY_ITEMS" else None
        )
        db.add(approval)

    # OUTBOX: Queue action for cloud sync if local
    append_to_outbox(
        db,
        action_type="discount_applied",
        payload={
            "order_id": str(order_id),
            "staff_id": str(_get_user_id(staff_user)),
            "discount_data": data.model_dump(mode="json"),
        }
    )

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
    approval.resolved_at = datetime.now(timezone.utc)

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
            order.discount_value = subtotal
        elif approval.discount_type == "COMPLIMENTARY_ITEMS" and approval.complimentary_items:
            _apply_item_level_complimentary(db, order, approval.complimentary_items)

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

    order.finalized_at = datetime.now(timezone.utc)
    
    # OUTBOX: Queue action for cloud sync if local
    append_to_outbox(
        db,
        action_type="bill_finalized",
        payload={"order_id": str(order_id)}
    )
    
    await db.flush()
    return order


async def mark_bill_paid(
    db: AsyncSession,
    order_id: uuid.UUID,
    outlet_id: uuid.UUID,
    payment_method: str,
    cash_denominations: dict[str, int] | None = None,
    change_denominations: dict[str, int] | None = None,
    redeem_loyalty_points: int = 0,
    delivery_charge: Decimal = Decimal("0.00"),
    handling_charge: Decimal = Decimal("0.00"),
    apply_credit: Decimal = Decimal("0.00"),
    record_debit: Decimal = Decimal("0.00"),
    record_credit: Decimal = Decimal("0.00"),
    debt_settled: Decimal = Decimal("0.00"),
    credit_cashed_out: Decimal = Decimal("0.00"),
    staff_user: Any = None,
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

    if not order.customer_id and (apply_credit > 0 or record_debit > 0 or record_credit > 0 or debt_settled > 0 or credit_cashed_out > 0):
        raise HTTPException(status_code=400, detail="Cannot process Udhaar or Store Credit without linking a customer first.")

    order.payment_method = payment_method
    if payment_method == "CASH":
        from app.models.cash_drawer_ledger import CashDrawerLedger

        order.cash_denominations = cash_denominations
        order.change_denominations = change_denominations

        denom_strs = []
        if cash_denominations:
            denom_strs = [f"₹{k}x{v}" for k, v in cash_denominations.items() if v > 0]
            # Write received cash to ledger
            ledger_in = CashDrawerLedger(
                outlet_id=outlet_id,
                transaction_type="CUSTOMER_PAYMENT",
                denominations=cash_denominations,
                reference_order_id=order_id,
            )
            db.add(ledger_in)

        change_strs = []
        if change_denominations:
            change_strs = [f"₹{k}x{v}" for k, v in change_denominations.items() if v > 0]
            # Write change given to ledger (we store absolute counts, but logic will subtract them)
            # We can store them as positive counts representing what was withdrawn, or negative. 
            # To be clear, let's store exactly the count the user tapped (positive) and we will subtract it when summing up.
            ledger_out = CashDrawerLedger(
                outlet_id=outlet_id,
                transaction_type="CUSTOMER_CHANGE",
                denominations=change_denominations,
                reference_order_id=order_id,
            )
            db.add(ledger_out)

        if denom_strs:
            ref_str = f"CASH [IN: {', '.join(denom_strs)}]"
            if change_strs:
                ref_str += f" [OUT: {', '.join(change_strs)}]"
            order.payment_reference = ref_str
        else:
            order.payment_reference = "CASH"
    elif not order.payment_reference:
        order.payment_reference = payment_method

    # Walk-in POS bills go straight to COMPLETED status without needing manual verification
    order.is_auto_verified = True
    order.status = OrderStatusEnum.COMPLETED
    order.paid_at = datetime.now(timezone.utc)
    if not order.finalized_at:
        order.finalized_at = datetime.now(timezone.utc)

    res_outlet = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
    outlet = res_outlet.scalar_one_or_none()

    from app.models.customer import Customer
    # Loyalty Points Redemption
    discount_inr = Decimal("0.00")
    if redeem_loyalty_points > 0 and outlet and (order.customer_id or order.customer_phone):
        if order.customer_id:
            res_cust = await db.execute(select(Customer).where(Customer.id == order.customer_id, Customer.outlet_id == outlet_id))
        else:
            res_cust = await db.execute(select(Customer).where(Customer.phone == order.customer_phone, Customer.outlet_id == outlet_id))
        cust = res_cust.scalar_one_or_none()
        if cust and cust.loyalty_points >= redeem_loyalty_points:
            import math
            applicable_percentage = Decimal("0.00")
            for tier in outlet.loyalty_redemption_tiers or []:
                min_p = tier.get("min_points", 0)
                max_p = tier.get("max_points")
                if cust.loyalty_points >= min_p and (max_p is None or cust.loyalty_points <= max_p):
                    applicable_percentage = Decimal(str(tier.get("discount_percentage", "0.00")))
                    break

            value_per_point_inr = applicable_percentage / Decimal("100.00")
            requested_discount_inr = Decimal(str(redeem_loyalty_points)) * value_per_point_inr

            max_bill_percentage = Decimal(str(outlet.loyalty_max_bill_percentage or "100.00"))
            current_total_amount = order.total_amount or Decimal("0.00")
            max_allowed_discount_inr = (max_bill_percentage / Decimal("100.00")) * current_total_amount

            discount_inr = min(requested_discount_inr, max_allowed_discount_inr)

            actual_points_deducted = redeem_loyalty_points
            if value_per_point_inr > 0 and requested_discount_inr > max_allowed_discount_inr:
                actual_points_deducted = math.ceil(float(discount_inr / value_per_point_inr))
            
            actual_points_deducted = min(actual_points_deducted, cust.loyalty_points)

            cust.loyalty_points -= actual_points_deducted
            order.loyalty_points_redeemed = actual_points_deducted
            order.loyalty_discount_inr = discount_inr

    # Update delivery and handling charges
    order.delivery_charge = delivery_charge
    order.handling_charge = handling_charge

    # Recalculate Final Amount
    discounted_subtotal = max(Decimal("0.00"), (order.total_amount or Decimal("0.00")) - discount_inr)
    net_payable = discounted_subtotal + delivery_charge + handling_charge
    order.total_amount = Decimal(str(round(float(net_payable))))

    # Loyalty Points Earning
    if outlet and outlet.loyalty_points_per_100_inr > 0 and (order.customer_id or order.customer_phone):
        if order.customer_id:
            res_cust = await db.execute(select(Customer).where(Customer.id == order.customer_id, Customer.outlet_id == outlet_id))
        else:
            res_cust = await db.execute(select(Customer).where(Customer.phone == order.customer_phone, Customer.outlet_id == outlet_id))
        cust = res_cust.scalar_one_or_none()
        if cust:
            earned = round((float(order.total_amount or 0.0) / 100.0) * outlet.loyalty_points_per_100_inr)
            if earned > 0:
                cust.loyalty_points += earned
                order.loyalty_points_earned = earned

    # Credit/Debit Processing
    if (apply_credit > 0 or record_debit > 0 or record_credit > 0 or debt_settled > 0 or credit_cashed_out > 0) and (order.customer_id or order.customer_phone):
        if order.customer_id:
            res_cust = await db.execute(select(Customer).where(Customer.id == order.customer_id, Customer.outlet_id == outlet_id))
        else:
            res_cust = await db.execute(select(Customer).where(Customer.phone == order.customer_phone, Customer.outlet_id == outlet_id))
        cust = res_cust.scalar_one_or_none()
        if cust:
            # Apply Credit
            if apply_credit > 0:
                # Deduct from customer's credit balance (whether positive or negative, applying credit lowers the balance)
                cust.credit_balance -= apply_credit
                order.credit_applied = apply_credit
                
                # Log to ledger
                ledger_credit = CustomerLedger(
                    customer_id=cust.id,
                    outlet_id=outlet_id,
                    order_id=order.id,
                    entry_type="CREDIT_APPLIED",
                    amount=apply_credit,
                    balance_after=cust.credit_balance,
                    note=f"Credit used for Bill {order.basket_number}",
                    created_by_staff_id=_get_user_id(staff_user) if staff_user else None
                )
                db.add(ledger_credit)

            # Record Debit (Shortfall)
            if record_debit > 0:
                # Customer owes money, so their balance goes down (more negative)
                cust.credit_balance -= record_debit
                order.debit_applied = record_debit
                
                # Log to ledger
                ledger_debit = CustomerLedger(
                    customer_id=cust.id,
                    outlet_id=outlet_id,
                    order_id=order.id,
                    entry_type="DEBIT_ADDED",
                    amount=record_debit,
                    balance_after=cust.credit_balance,
                    note=f"Shortfall recorded for Bill {order.basket_number}",
                    created_by_staff_id=_get_user_id(staff_user) if staff_user else None
                )
                db.add(ledger_debit)

            # Settle Debt (Pay off Udhaar)
            if debt_settled > 0:
                cust.credit_balance += debt_settled
                order.debt_settled = debt_settled
                
                # Log to ledger
                ledger_debt_settled = CustomerLedger(
                    customer_id=cust.id,
                    outlet_id=outlet_id,
                    order_id=order.id,
                    entry_type="DEBIT_SETTLED",
                    amount=debt_settled,
                    balance_after=cust.credit_balance,
                    note=f"Paid off Udhaar (Debt Settled) for Bill {order.basket_number}",
                    created_by_staff_id=_get_user_id(staff_user) if staff_user else None
                )
                db.add(ledger_debt_settled)

            # Record Credit (Cashier is Short)
            if record_credit > 0:
                cust.credit_balance += record_credit
                order.credit_awarded = record_credit
                
                # Log to ledger
                ledger_credit_awarded = CustomerLedger(
                    customer_id=cust.id,
                    outlet_id=outlet_id,
                    order_id=order.id,
                    entry_type="CREDIT_ADDED",
                    amount=record_credit,
                    balance_after=cust.credit_balance,
                    note=f"Store credit awarded (Change Shortfall) for Bill {order.basket_number}",
                    created_by_staff_id=_get_user_id(staff_user) if staff_user else None
                )
                db.add(ledger_credit_awarded)

            # Credit Cashed Out
            if credit_cashed_out > 0:
                cust.credit_balance -= credit_cashed_out
                order.credit_cashed_out = credit_cashed_out
                
                # Log to ledger
                ledger_credit_cashed_out = CustomerLedger(
                    customer_id=cust.id,
                    outlet_id=outlet_id,
                    order_id=order.id,
                    entry_type="CREDIT_USED", # Functionally it is used/withdrawn
                    amount=credit_cashed_out,
                    balance_after=cust.credit_balance,
                    note=f"Store credit cashed out for Bill {order.basket_number}",
                    created_by_staff_id=_get_user_id(staff_user) if staff_user else None
                )
                db.add(ledger_credit_cashed_out)
            
            order.customer_balance = cust.credit_balance


    # Trigger recipe auto-deduction for stock management
    await process_order_auto_deduction(db, order)

    # OUTBOX: Queue action for cloud sync if local
    append_to_outbox(
        db,
        action_type="payment_confirmed",
        payload={
            "order_id": str(order_id),
            "payment_data": {
                "payment_method": payment_method,
                "cash_denominations": cash_denominations
            },
            "confirmed_offline": True,
        }
    )

    # Deferred refund: if this bill replaces an old one, void the old bill now that payment is confirmed
    if getattr(order, "replaces_bill_id", None):
        try:
            old_order_res = await db.execute(
                select(Order).options(selectinload(Order.items)).where(
                    Order.id == order.replaces_bill_id,
                    Order.outlet_id == outlet_id,
                )
            )
            old_order = old_order_res.scalar_one_or_none()
            if old_order and old_order.status != OrderStatusEnum.REFUNDED:
                from app.schemas.billing import CustomerReturnRequest, CustomerReturnItemInput
                return_items = [
                    CustomerReturnItemInput(
                        order_item_id=str(it.id),
                        menu_item_id=str(it.menu_item_id) if it.menu_item_id else None,
                        item_name=it.item_name,
                        quantity=float(it.quantity),
                        unit_price=float(it.unit_price) if it.unit_price is not None else 0.0,
                        reason="EDIT_BILL_VOID"
                    )
                    for it in old_order.items
                ]
                return_req = CustomerReturnRequest(
                    order_id=str(old_order.id),
                    customer_name=old_order.customer_name,
                    customer_phone=old_order.customer_phone,
                    return_items=return_items,
                    exchange_items=[],
                    refund_payment_method=old_order.payment_method or "CASH",
                    notes="Automatic return due to bill edit"
                )
                await process_customer_return(db, outlet_id, None, return_req)
                old_order.status = OrderStatusEnum.REFUNDED
        except Exception as e:
            print(f"Failed to process deferred old bill voiding: {e}")

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
            Order.status.in_([OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED]),
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
                matching.returned_quantity += ret_qty
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

    if order:
        all_returned = True
        for item in order.items:
            if item.returned_quantity < item.quantity:
                all_returned = False
                break
        if all_returned:
            order.status = OrderStatusEnum.REFUNDED

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
    
    # If cash refund denominations are provided, log a drawer transaction
    if data.refund_payment_method == "CASH" and (data.refund_cash_denominations or data.inward_cash_denominations):
        from app.models.cash_drawer_ledger import CashDrawerLedger
        net_denoms = {}
        
        # Inward cash (positive)
        if data.inward_cash_denominations:
            for k, v in data.inward_cash_denominations.items():
                if v > 0:
                    net_denoms[k] = net_denoms.get(k, 0) + v
                    
        # Outward cash (refund, negative)
        if data.refund_cash_denominations:
            for k, v in data.refund_cash_denominations.items():
                if v > 0:
                    net_denoms[k] = net_denoms.get(k, 0) - v
                    
        # Filter out 0 net changes
        net_denoms = {str(k): int(v) for k, v in net_denoms.items() if v != 0}
        
        if net_denoms:
            refund_tx = CashDrawerLedger(
                outlet_id=outlet_id,
                transaction_type="CUSTOMER_RETURN",
                denominations=net_denoms,
                reference_order_id=order.id if order else None,
                notes=f"Refund exchange for return {return_num}",
                created_by=_get_user_id(staff_user)
            )
            db.add(refund_tx)

    # Process Customer Wallet (Store Credit/Debt) & Loyalty Points deduction
    if customer_phone:
        from app.models.customer import Customer
        from app.models.customer_ledger import CustomerLedger
        
        cust_res = await db.execute(
            select(Customer).where(
                Customer.outlet_id == outlet_id,
                Customer.phone == customer_phone
            )
        )
        customer = cust_res.scalar_one_or_none()
        
        if customer:
            # 1. Loyalty Points Deduction for Return Value
            res_rest = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
            outlet = res_rest.scalar_one_or_none()
            if outlet and getattr(outlet, "loyalty_points_per_rupee", 0) > 0 and total_return_amount > 0:
                points_to_deduct = int(float(total_return_amount) * float(outlet.loyalty_points_per_rupee))
                if points_to_deduct > 0:
                    customer.loyalty_points = max(0, (customer.loyalty_points or 0) - points_to_deduct)

            # 2. Process Ledger Operations
            ledger_entries = []
            
            if data.apply_credit > 0:
                customer.credit_balance -= data.apply_credit
                ledger_entries.append(
                    CustomerLedger(
                        outlet_id=outlet_id,
                        customer_id=customer.id,
                        entry_type="CREDIT_APPLIED",
                        amount=-data.apply_credit,
                        balance_after=customer.credit_balance,
                        note=f"Store credit applied to return/exchange {return_num}"
                    )
                )
            if data.credit_cashed_out > 0:
                customer.credit_balance -= data.credit_cashed_out
                ledger_entries.append(
                    CustomerLedger(
                        outlet_id=outlet_id,
                        customer_id=customer.id,
                        entry_type="CREDIT_APPLIED",
                        amount=-data.credit_cashed_out,
                        balance_after=customer.credit_balance,
                        note=f"Store credit cashed out during return {return_num}"
                    )
                )
            if data.debt_settled > 0:
                customer.credit_balance += data.debt_settled
                ledger_entries.append(
                    CustomerLedger(
                        outlet_id=outlet_id,
                        customer_id=customer.id,
                        entry_type="DEBIT_APPLIED",
                        amount=data.debt_settled,
                        balance_after=customer.credit_balance,
                        note=f"Excess cash applied to settle debt during return {return_num}"
                    )
                )
            if data.record_credit > 0:
                customer.credit_balance += data.record_credit
                ledger_entries.append(
                    CustomerLedger(
                        outlet_id=outlet_id,
                        customer_id=customer.id,
                        entry_type="CREDIT_ADDED",
                        amount=data.record_credit,
                        balance_after=customer.credit_balance,
                        note=f"Refund shortfall converted to Store Credit {return_num}"
                    )
                )
            if data.record_debit > 0:
                customer.credit_balance -= data.record_debit
                ledger_entries.append(
                    CustomerLedger(
                        outlet_id=outlet_id,
                        customer_id=customer.id,
                        entry_type="DEBIT_ADDED",
                        amount=-data.record_debit,
                        balance_after=customer.credit_balance,
                        note=f"Extra refund given / payment shortfall recorded as Debt {return_num}"
                    )
                )
            db.add_all(ledger_entries)
    
    # OUTBOX: Queue action for cloud sync if local
    append_to_outbox(
        db,
        action_type="customer_return",
        payload={
            "staff_id": str(_get_user_id(staff_user)) if _get_user_id(staff_user) else None,
            "return_data": data.model_dump(mode="json"),
        }
    )

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
        "credit_applied": float(data.apply_credit or 0),
        "credit_cashed_out": float(data.credit_cashed_out or 0),
        "debt_settled": float(data.debt_settled or 0),
        "credit_awarded": float(data.record_credit or 0),
        "debit_applied": float(data.record_debit or 0),
        "wallet_balance_after": float(customer.credit_balance) if customer else None,
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


async def delete_manual_bill(db: AsyncSession, bill_id: uuid.UUID, outlet_id: uuid.UUID, staff_user: Any) -> None:
    """Explicitly delete a bill and log the action. Only allowed for non-completed/paid bills."""
    res = await db.execute(
        select(Order).where(Order.id == bill_id, Order.outlet_id == outlet_id)
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Bill not found")
        
    if order.status in [OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED, OrderStatusEnum.REFUNDED]:
        raise HTTPException(status_code=400, detail="Cannot delete a paid, completed, or refunded bill.")

    # Delete any pending discount approvals first
    await db.execute(
        delete(BillDiscountApproval).where(BillDiscountApproval.order_id == order.id)
    )
    
    # Log the action
    from app.services.staff_service import create_staff_audit_log
    await create_staff_audit_log(
        db=db,
        outlet_id=outlet_id,
        staff_id=_get_user_id(staff_user),
        action_type="bill_deleted",
        reference_type="Order",
        reference_id=str(order.id),
        details=f"Deleted manual bill {order.basket_number}. Status was {order.status.value}. Amount: {order.total_amount}"
    )

    # Sync action to outbox
    append_to_outbox(
        db=db,
        action_type="bill_deleted",
        payload={
            "bill_id": str(order.id),
            "basket_number": order.basket_number,
            "deleted_by": str(_get_user_id(staff_user))
        }
    )

    await db.delete(order)
    await db.flush()
