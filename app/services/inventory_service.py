"""
Inventory service — recipe-based auto-deduction, stock intake logging, ledger tracking, and cancellation reversals.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from datetime import datetime, timedelta

from app.models.enums import InventoryUnitEnum, StockChangeTypeEnum
from app.models.inventory_item import InventoryItem
from app.models.menu_item_recipe import MenuItemRecipe
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.stock_intake import StockIntake
from app.models.stock_ledger import StockLedger
from app.schemas.inventory import (
    InventoryItemCreate,
    InventoryItemUpdate,
    RecipeSaveRequest,
    StockIntakeCreate,
    StockWastageRequest,
)


async def process_order_auto_deduction(
    db: AsyncSession,
    order: Order,
) -> None:
    """
    Auto-deduct stock for an order based on recipe mappings.
    Triggers when order enters PAID or PREPARING state.
    Deducts stock at the BATCH level in FIFO order by earliest expiry_date.
    Does NOT block order fulfillment if aggregate stock goes negative.
    """
    # Check if already deducted
    existing = await db.execute(
        select(StockLedger).where(
            StockLedger.reference_order_id == order.id,
            StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
        )
    )
    if existing.scalars().first() is not None:
        return

    # Ensure order items are loaded
    if not order.items:
        items_res = await db.execute(
            select(OrderItem).where(OrderItem.order_id == order.id)
        )
        order_items = items_res.scalars().all()
    else:
        order_items = order.items

    for item in order_items:
        if not item.menu_item_id:
            continue

        # Fetch recipe for this menu item
        recipe_res = await db.execute(
            select(MenuItemRecipe).where(
                MenuItemRecipe.menu_item_id == item.menu_item_id
            )
        )
        recipes = recipe_res.scalars().all()
        if not recipes:
            continue  # No recipe mapped — skip auto-deduction for this dish

        for recipe in recipes:
            deduct_qty = Decimal(str(recipe.quantity_required)) * Decimal(str(item.quantity))

            inv_res = await db.execute(
                select(InventoryItem).where(
                    InventoryItem.id == recipe.inventory_item_id,
                    InventoryItem.outlet_id == order.outlet_id,
                )
            )
            inv_item = inv_res.scalar_one_or_none()
            if not inv_item:
                continue

            inv_item.current_stock = inv_item.current_stock - deduct_qty

            # FIFO batch stock drawdown by earliest expiry date
            batches_res = await db.execute(
                select(StockIntake)
                .where(
                    StockIntake.item_id == inv_item.id,
                    StockIntake.outlet_id == order.outlet_id,
                    StockIntake.remaining_quantity > Decimal("0.000"),
                )
                .order_by(
                    StockIntake.expiry_date.asc().nulls_last(),
                    StockIntake.intake_date.asc(),
                )
            )
            batches = batches_res.scalars().all()

            needed = deduct_qty
            for batch in batches:
                if needed <= Decimal("0.000"):
                    break
                take = min(batch.remaining_quantity, needed)
                batch.remaining_quantity = batch.remaining_quantity - take
                needed = needed - take

            ledger_entry = StockLedger(
                id=uuid.uuid4(),
                outlet_id=order.outlet_id,
                item_id=inv_item.id,
                change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
                quantity_change=-deduct_qty,
                resulting_stock=inv_item.current_stock,
                reference_order_id=order.id,
                unit_cost_snapshot=inv_item.cost_per_unit,
            )
            db.add(ledger_entry)

    await db.flush()


async def process_order_cancellation_reversal(
    db: AsyncSession,
    order: Order,
) -> None:
    """
    Reverse auto-deduction if an order is cancelled or refunded after stock deduction.
    Restores deducted quantities to current_stock and appends RESTOCK ledger entries.
    """
    # Fetch deduction entries for this order
    deductions_res = await db.execute(
        select(StockLedger).where(
            StockLedger.reference_order_id == order.id,
            StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
        )
    )
    deductions = deductions_res.scalars().all()
    if not deductions:
        return  # Was never deducted

    # Check if already restocked
    restocked_res = await db.execute(
        select(StockLedger).where(
            StockLedger.reference_order_id == order.id,
            StockLedger.change_type == StockChangeTypeEnum.RESTOCK,
        )
    )
    if restocked_res.scalars().first() is not None:
        return  # Already restocked

    for entry in deductions:
        restore_qty = abs(entry.quantity_change)

        inv_res = await db.execute(
            select(InventoryItem).where(
                InventoryItem.id == entry.item_id,
                InventoryItem.outlet_id == order.outlet_id,
            )
        )
        inv_item = inv_res.scalar_one_or_none()
        if not inv_item:
            continue

        inv_item.current_stock = inv_item.current_stock + restore_qty

        restock_ledger = StockLedger(
            id=uuid.uuid4(),
            outlet_id=order.outlet_id,
            item_id=inv_item.id,
            change_type=StockChangeTypeEnum.RESTOCK,
            quantity_change=restore_qty,
            resulting_stock=inv_item.current_stock,
            reference_order_id=order.id,
            unit_cost_snapshot=entry.unit_cost_snapshot or inv_item.cost_per_unit,
        )
        db.add(restock_ledger)

    await db.flush()


async def create_inventory_item(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    data: InventoryItemCreate,
) -> InventoryItem:
    """Create a new ingredient in the master list for an outlet."""
    item = InventoryItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name=data.name.trim() if hasattr(data.name, "trim") else data.name.strip(),
        unit=data.unit,
        category=data.category.strip() if data.category else "General",
        current_stock=data.current_stock,
        reorder_threshold=data.reorder_threshold,
        cost_per_unit=data.cost_per_unit,
        is_active=True,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def update_inventory_item(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    item_id: uuid.UUID,
    data: InventoryItemUpdate,
) -> InventoryItem:
    """Update an ingredient master record."""
    res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.outlet_id == outlet_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    if data.name is not None:
        item.name = data.name.strip()
    if data.unit is not None:
        item.unit = data.unit
    if data.category is not None:
        item.category = data.category.strip()
    if data.current_stock is not None:
        item.current_stock = data.current_stock
    if data.reorder_threshold is not None:
        item.reorder_threshold = data.reorder_threshold
    if data.cost_per_unit is not None:
        item.cost_per_unit = data.cost_per_unit
    if data.is_active is not None:
        item.is_active = data.is_active

    await db.flush()
    await db.refresh(item)
    return item


def generate_batch_number(prefix: str = "BAT") -> str:
    """Generate a unique batch number, e.g. BAT-20260810-AB12."""
    date_str = datetime.utcnow().strftime("%Y%m%d")
    random_suffix = uuid.uuid4().hex[:4].upper()
    return f"{prefix}-{date_str}-{random_suffix}"


async def log_stock_intake(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    user_id: uuid.UUID | None,
    data: StockIntakeCreate,
) -> StockIntake:
    """
    Log a daily stock arrival:
    1. Creates StockIntake record with unique batch number
    2. Increments InventoryItem.current_stock
    3. Updates InventoryItem.cost_per_unit with new unit cost
    4. Appends StockLedger entry (change_type="intake")
    """
    res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == data.item_id,
            InventoryItem.outlet_id == outlet_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    batch_num = data.batch_number.strip() if data.batch_number else generate_batch_number()

    intake = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        batch_number=batch_num,
        quantity=data.quantity,
        remaining_quantity=data.quantity,
        unit_cost=data.unit_cost,
        supplier_name=data.supplier_name.strip() if data.supplier_name else None,
        intake_date=data.intake_date,
        expiry_date=data.expiry_date,
        added_by=user_id,
        notes=data.notes.strip() if data.notes else None,
    )
    db.add(intake)

    # Increment stock and update cost per unit
    item.current_stock = item.current_stock + data.quantity
    item.cost_per_unit = data.unit_cost

    ledger = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        change_type=StockChangeTypeEnum.INTAKE,
        quantity_change=data.quantity,
        resulting_stock=item.current_stock,
        created_by=user_id,
    )
    db.add(ledger)

    await db.flush()
    await db.refresh(intake)
    return intake


async def quick_scan_increment(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    user_id: uuid.UUID | None,
    barcode: str,
    quantity: Decimal = Decimal("1.000"),
    batch_number: str | None = None,
    expiry_date: datetime | None = None,
    unit_cost: Decimal | None = None,
) -> tuple[InventoryItem, StockIntake]:
    """
    Subsequent scan: Auto-increments item count for recognized barcode.
    Creates a new batch record and ledger entry.
    """
    clean_barcode = barcode.strip()
    res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.outlet_id == outlet_id,
            InventoryItem.barcode == clean_barcode,
            InventoryItem.is_active == True,  # noqa: E712
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No item registered with barcode '{clean_barcode}'",
        )

    effective_cost = unit_cost if unit_cost is not None else item.cost_per_unit
    batch_num = batch_number.strip() if batch_number else generate_batch_number()

    intake = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        batch_number=batch_num,
        quantity=quantity,
        remaining_quantity=quantity,
        unit_cost=effective_cost,
        intake_date=datetime.utcnow(),
        expiry_date=expiry_date,
        added_by=user_id,
        notes="Quick barcode scan inward",
    )
    db.add(intake)

    item.current_stock = item.current_stock + quantity
    if unit_cost is not None:
        item.cost_per_unit = unit_cost

    ledger = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        change_type=StockChangeTypeEnum.INTAKE,
        quantity_change=quantity,
        resulting_stock=item.current_stock,
        created_by=user_id,
    )
    db.add(ledger)

    await db.flush()
    await db.refresh(item)
    await db.refresh(intake)
    return item, intake


async def onboard_scanned_item(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    user_id: uuid.UUID | None,
    barcode: str,
    name: str,
    category: str = "General",
    unit: InventoryUnitEnum = InventoryUnitEnum.PCS,
    initial_stock: Decimal = Decimal("1.000"),
    cost_per_unit: Decimal = Decimal("0.00"),
    selling_price: Decimal | None = None,
    reorder_threshold: Decimal = Decimal("5.000"),
    batch_number: str | None = None,
    expiry_date: datetime | None = None,
    supplier_name: str | None = None,
) -> tuple[InventoryItem, StockIntake | None]:
    """
    First-time scan: Registers a new item with barcode, saves initial batch & stock.
    Also creates corresponding MenuItem if selling_price is provided.
    """
    clean_barcode = barcode.strip()

    # Check for duplicate barcode in this outlet
    existing = await db.execute(
        select(InventoryItem).where(
            InventoryItem.outlet_id == outlet_id,
            InventoryItem.barcode == clean_barcode,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Barcode '{clean_barcode}' is already assigned to another inventory item",
        )

    # 1. Create InventoryItem
    item = InventoryItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name=name.strip(),
        barcode=clean_barcode,
        unit=unit,
        category=category.strip(),
        current_stock=initial_stock,
        reorder_threshold=reorder_threshold,
        cost_per_unit=cost_per_unit,
        is_active=True,
    )
    db.add(item)
    await db.flush()

    intake = None
    if initial_stock > Decimal("0.000"):
        batch_num = batch_number.strip() if batch_number else generate_batch_number()
        intake = StockIntake(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            batch_number=batch_num,
            quantity=initial_stock,
            remaining_quantity=initial_stock,
            unit_cost=cost_per_unit,
            supplier_name=supplier_name.strip() if supplier_name else None,
            intake_date=datetime.utcnow(),
            expiry_date=expiry_date,
            added_by=user_id,
            notes="Initial barcode onboarding batch",
        )
        db.add(intake)

        ledger = StockLedger(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            change_type=StockChangeTypeEnum.INTAKE,
            quantity_change=initial_stock,
            resulting_stock=initial_stock,
            created_by=user_id,
        )
        db.add(ledger)

    # 2. Optionally create/link MenuItem for POS billing
    if selling_price is not None:
        from app.models.category import Category
        from app.models.menu_item import MenuItem

        # Look up or create category
        cat_res = await db.execute(
            select(Category).where(
                Category.outlet_id == outlet_id,
                Category.name.ilike(category.strip()),
            )
        )
        cat_row = cat_res.scalar_one_or_none()
        if not cat_row:
            cat_row = Category(
                id=uuid.uuid4(),
                outlet_id=outlet_id,
                name=category.strip(),
                display_order=0,
            )
            db.add(cat_row)
            await db.flush()

        menu_item = MenuItem(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            category_id=cat_row.id,
            name=name.strip(),
            barcode=clean_barcode,
            price=selling_price,
            is_available=True,
            is_verification_required=False,
            unit_label=unit.value.lower(),
        )
        db.add(menu_item)

    await db.flush()
    await db.refresh(item)
    if intake:
        await db.refresh(intake)
    return item, intake


async def get_all_batches(
    db: AsyncSession,
    outlet_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """
    Get list of all intake batches for an outlet with FEFO / expiry status.
    """
    now = datetime.utcnow()
    res = await db.execute(
        select(StockIntake)
        .options(selectinload(StockIntake.item))
        .where(StockIntake.outlet_id == outlet_id)
        .order_by(StockIntake.intake_date.desc())
    )
    batches = res.scalars().all()

    result = []
    for b in batches:
        if b.remaining_quantity <= Decimal("0.000"):
            status_str = "DEPLETED"
        elif b.expiry_date and b.expiry_date < now:
            status_str = "EXPIRED"
        elif b.expiry_date and b.expiry_date <= now + timedelta(days=7):
            status_str = "EXPIRING_SOON"
        else:
            status_str = "ACTIVE"

        result.append({
            "id": b.id,
            "outlet_id": b.outlet_id,
            "item_id": b.item_id,
            "item_name": b.item.name if b.item else "Unknown Item",
            "item_barcode": b.item.barcode if b.item else None,
            "unit": b.item.unit if b.item else InventoryUnitEnum.PCS,
            "batch_number": b.batch_number or f"BAT-{b.id.hex[:6]}",
            "quantity": b.quantity,
            "remaining_quantity": b.remaining_quantity,
            "unit_cost": b.unit_cost,
            "supplier_name": b.supplier_name,
            "intake_date": b.intake_date,
            "expiry_date": b.expiry_date,
            "status": status_str,
        })
    return result


async def save_menu_item_recipe(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    data: RecipeSaveRequest,
) -> list[MenuItemRecipe]:
    """Save/update the ingredient recipe mapping for a menu item."""
    # Delete existing recipe rows for this menu item
    existing_res = await db.execute(
        select(MenuItemRecipe).where(
            MenuItemRecipe.menu_item_id == data.menu_item_id
        )
    )
    for old_row in existing_res.scalars().all():
        await db.delete(old_row)

    new_recipes: list[MenuItemRecipe] = []
    for ing in data.ingredients:
        recipe_row = MenuItemRecipe(
            id=uuid.uuid4(),
            menu_item_id=data.menu_item_id,
            inventory_item_id=ing.inventory_item_id,
            quantity_required=ing.quantity_required,
            unit=ing.unit,
        )
        db.add(recipe_row)
        new_recipes.append(recipe_row)

    await db.flush()
    return new_recipes


async def get_near_expiry_alerts(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    threshold_days: int = 7,
) -> list[dict[str, Any]]:
    """
    Find active intake batches (remaining_quantity > 0) with expiry_date <= NOW() + threshold_days.
    """
    now = datetime.utcnow()
    cutoff_date = now + timedelta(days=threshold_days)

    res = await db.execute(
        select(StockIntake)
        .options(selectinload(StockIntake.item))
        .where(
            StockIntake.outlet_id == outlet_id,
            StockIntake.remaining_quantity > Decimal("0.000"),
            StockIntake.expiry_date.is_not(None),
            StockIntake.expiry_date <= cutoff_date,
        )
        .order_by(StockIntake.expiry_date.asc())
    )
    batches = res.scalars().all()

    alerts = []
    for batch in batches:
        if not batch.expiry_date:
            continue
        days_left = (batch.expiry_date.date() - now.date()).days
        status_str = "EXPIRED" if days_left < 0 else "EXPIRING_SOON"
        alerts.append({
            "intake_id": batch.id,
            "item_id": batch.item_id,
            "item_name": batch.item.name if batch.item else "Unknown Item",
            "unit": batch.item.unit if batch.item else InventoryUnitEnum.PCS,
            "remaining_quantity": batch.remaining_quantity,
            "expiry_date": batch.expiry_date,
            "days_until_expiry": days_left,
            "status": status_str,
        })
    return alerts


async def log_stock_wastage(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    data: StockWastageRequest,
    user_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """
    Log stock loss/spoilage/breakage/theft as MANUAL_ADJUSTMENT in ledger,
    decrement current_stock, and draw down batch lot if applicable.
    """
    res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == data.item_id,
            InventoryItem.outlet_id == outlet_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    waste_qty = data.quantity

    # Draw down batch if specified or FEFO
    if data.batch_number:
        b_res = await db.execute(
            select(StockIntake).where(
                StockIntake.item_id == item.id,
                StockIntake.outlet_id == outlet_id,
                StockIntake.batch_number == data.batch_number,
            )
        )
        batch = b_res.scalar_one_or_none()
        if batch:
            batch.remaining_quantity = max(Decimal("0.000"), batch.remaining_quantity - waste_qty)
    else:
        # Draw down active batches by FEFO (earliest expiry first)
        batches_res = await db.execute(
            select(StockIntake)
            .where(
                StockIntake.item_id == item.id,
                StockIntake.outlet_id == outlet_id,
                StockIntake.remaining_quantity > Decimal("0.000"),
            )
            .order_by(StockIntake.expiry_date.asc().nulls_last(), StockIntake.intake_date.asc())
        )
        active_batches = batches_res.scalars().all()
        rem_to_deduct = waste_qty
        for b in active_batches:
            if rem_to_deduct <= Decimal("0.000"):
                break
            deduct_from_batch = min(b.remaining_quantity, rem_to_deduct)
            b.remaining_quantity -= deduct_from_batch
            rem_to_deduct -= deduct_from_batch

    # Update item current stock
    item.current_stock = item.current_stock - waste_qty
    if item.current_stock < Decimal("0.000"):
        item.current_stock = Decimal("0.000")

    loss_amount = waste_qty * (item.cost_per_unit or Decimal("0.00"))
    reason_label = data.reason.replace("_", " ").title()

    ledger_entry = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        change_type=StockChangeTypeEnum.MANUAL_ADJUSTMENT,
        quantity_change=-waste_qty,
        resulting_stock=item.current_stock,
        reference_order_id=None,
        created_by=user_id,
        unit_cost_snapshot=item.cost_per_unit,
    )
    db.add(ledger_entry)
    await db.flush()
    await db.refresh(item)

    return {
        "success": True,
        "message": f"Wrote off {waste_qty} {item.unit.value} of '{item.name}' ({reason_label})",
        "item_id": item.id,
        "item_name": item.name,
        "quantity_wasted": waste_qty,
        "new_current_stock": item.current_stock,
        "estimated_loss_amount": loss_amount,
        "ledger_entry_id": ledger_entry.id,
    }

