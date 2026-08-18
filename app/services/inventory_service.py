"""
Inventory service — recipe-based auto-deduction, stock intake logging, ledger tracking, and cancellation reversals.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy import select, update
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

        if recipes:
            # ── Type B: Recipe / Composite Product Deduction ─────────────────────
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

                # FEFO batch stock drawdown by earliest expiry date
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

                    db.add(StockLedger(
                        id=uuid.uuid4(),
                        outlet_id=order.outlet_id,
                        item_id=inv_item.id,
                        intake_id=batch.id,
                        change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
                        quantity_change=-take,
                        resulting_stock=inv_item.current_stock,
                        reference_order_id=order.id,
                        unit_cost_snapshot=batch.unit_cost,
                    ))

                # If needed > 0 remains (unbatched POS overselling balance)
                if needed > Decimal("0.000"):
                    db.add(StockLedger(
                        id=uuid.uuid4(),
                        outlet_id=order.outlet_id,
                        item_id=inv_item.id,
                        intake_id=None,
                        change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
                        quantity_change=-needed,
                        resulting_stock=inv_item.current_stock,
                        reference_order_id=order.id,
                        unit_cost_snapshot=inv_item.cost_per_unit,
                    ))
        else:
            # ── Type A: Direct 1:1 Product Deduction Fallback ───────────────────
            from app.models.menu_item import MenuItem
            mi_res = await db.execute(
                select(MenuItem).where(MenuItem.id == item.menu_item_id)
            )
            menu_item_obj = mi_res.scalar_one_or_none()
            if not menu_item_obj:
                continue

            target_inv_item: InventoryItem | None = None
            if menu_item_obj.inventory_item_id:
                inv_res = await db.execute(
                    select(InventoryItem).where(
                        InventoryItem.id == menu_item_obj.inventory_item_id,
                        InventoryItem.outlet_id == order.outlet_id,
                    )
                )
                target_inv_item = inv_res.scalar_one_or_none()
            elif menu_item_obj.barcode:
                inv_res = await db.execute(
                    select(InventoryItem).where(
                        InventoryItem.outlet_id == order.outlet_id,
                        InventoryItem.barcode == menu_item_obj.barcode,
                    )
                )
                target_inv_item = inv_res.scalar_one_or_none()

            if not target_inv_item:
                inv_res = await db.execute(
                    select(InventoryItem).where(
                        InventoryItem.outlet_id == order.outlet_id,
                        InventoryItem.name.ilike(menu_item_obj.name.strip()),
                    )
                )
                target_inv_item = inv_res.scalar_one_or_none()

            if not target_inv_item:
                continue

            deduct_qty = Decimal(str(item.quantity))
            target_inv_item.current_stock = target_inv_item.current_stock - deduct_qty

            # FEFO batch stock drawdown by earliest expiry date
            batches_res = await db.execute(
                select(StockIntake)
                .where(
                    StockIntake.item_id == target_inv_item.id,
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

                db.add(StockLedger(
                    id=uuid.uuid4(),
                    outlet_id=order.outlet_id,
                    item_id=target_inv_item.id,
                    intake_id=batch.id,
                    change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
                    quantity_change=-take,
                    resulting_stock=target_inv_item.current_stock,
                    reference_order_id=order.id,
                    unit_cost_snapshot=batch.unit_cost,
                ))

            if needed > Decimal("0.000"):
                db.add(StockLedger(
                    id=uuid.uuid4(),
                    outlet_id=order.outlet_id,
                    item_id=target_inv_item.id,
                    intake_id=None,
                    change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
                    quantity_change=-needed,
                    resulting_stock=target_inv_item.current_stock,
                    reference_order_id=order.id,
                    unit_cost_snapshot=target_inv_item.cost_per_unit,
                ))

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
        mrp=getattr(data, "mrp", None),
        tax_category=getattr(data, "tax_category", "GST 0%"),
        tax_rate=getattr(data, "tax_rate", Decimal("0.00")),
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
    if getattr(data, "mrp", None) is not None:
        item.mrp = data.mrp
    if getattr(data, "tax_category", None) is not None:
        item.tax_category = data.tax_category
    if getattr(data, "tax_rate", None) is not None:
        item.tax_rate = data.tax_rate
    if data.is_active is not None:
        item.is_active = data.is_active

    # Sync to linked MenuItem
    from app.models.menu_item import MenuItem
    mi_res = await db.execute(
        select(MenuItem).where(
            MenuItem.outlet_id == outlet_id,
            MenuItem.inventory_item_id == item.id,
        )
    )
    for mi in mi_res.scalars().all():
        if getattr(data, "mrp", None) is not None:
            mi.mrp = data.mrp
        if data.name is not None:
            mi.name = data.name.strip()

    from app.services.menu_service import invalidate_outlet_menu
    await invalidate_outlet_menu(db, outlet_id)

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

    # POS Auto-Reconciliation: check if pre-intake current_stock was negative
    pre_stock = item.current_stock
    unbatched_oversold = max(Decimal("0.000"), -pre_stock)
    remaining_qty = data.quantity

    if unbatched_oversold > Decimal("0.000"):
        absorbed = min(remaining_qty, unbatched_oversold)
        remaining_qty = remaining_qty - absorbed
        print(f"🔄 [POS Auto-Reconciliation] Absorbed {absorbed} units of oversold backorder into batch #{batch_num}")

    intake = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        batch_number=batch_num,
        quantity=data.quantity,
        initial_quantity=data.quantity,
        remaining_quantity=remaining_qty,
        unit_cost=data.unit_cost,
        supplier_name=data.supplier_name.strip() if data.supplier_name else None,
        intake_date=data.intake_date,
        expiry_date=data.expiry_date,
        added_by=user_id,
        notes=data.notes.strip() if data.notes else None,
    )
    db.add(intake)

    if unbatched_oversold > Decimal("0.000"):
        # Retroactively update unit_cost_snapshot for recent unbatched AUTO_DEDUCTION ledger entries
        stmt = (
            update(StockLedger)
            .where(
                StockLedger.item_id == item.id,
                StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
                StockLedger.intake_id.is_(None),
            )
            .values(intake_id=intake.id, unit_cost_snapshot=data.unit_cost)
        )
        await db.execute(stmt)

    # Increment stock and update cost per unit
    item.current_stock = item.current_stock + data.quantity
    item.cost_per_unit = data.unit_cost

    ledger = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        intake_id=intake.id,
        change_type=StockChangeTypeEnum.INTAKE,
        quantity_change=data.quantity,
        resulting_stock=item.current_stock,
        created_by=user_id,
        unit_cost_snapshot=data.unit_cost,
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
    mrp: Decimal | None = None,
    tax_category: str | None = "GST 0%",
    tax_rate: Decimal | None = Decimal("0.00"),
    sorted_quantity: Decimal | None = None,
    total_billed_amount: Decimal | None = None,
    item_id: uuid.UUID | None = None,
    wholesale_price: Decimal | None = None,
) -> tuple[InventoryItem, StockIntake | None]:
    """
    Scan / Manual Inward Stock: Registers a new item or appends a new batch to an existing item.
    Also creates or updates corresponding MenuItem if selling_price is provided.
    """
    clean_barcode = barcode.strip() if barcode and barcode.strip() else None

    # Determine net usable stock (Sorted Qty takes priority over Initial Qty)
    effective_stock = sorted_quantity if (sorted_quantity is not None and sorted_quantity > Decimal("0.000")) else initial_stock

    # Compute unit cost based on total billed amount if provided
    if total_billed_amount is not None and total_billed_amount > Decimal("0.00") and effective_stock > Decimal("0.000"):
        computed_unit_cost = (total_billed_amount / effective_stock).quantize(Decimal("0.01"))
    else:
        computed_unit_cost = cost_per_unit

    # Check if target item already exists by item_id, barcode, or name
    item: InventoryItem | None = None
    if item_id:
        res = await db.execute(
            select(InventoryItem).where(
                InventoryItem.outlet_id == outlet_id,
                InventoryItem.id == item_id,
                InventoryItem.is_active == True,  # noqa: E712
            )
        )
        item = res.scalar_one_or_none()

    if not item:
        # Check by name (case-insensitive) for outlet
        res_name = await db.execute(
            select(InventoryItem).where(
                InventoryItem.outlet_id == outlet_id,
                InventoryItem.name.ilike(name.strip()),
                InventoryItem.is_active == True,  # noqa: E712
            )
        )
        item = res_name.scalar_one_or_none()

    if item:
        # Item exists -> Update existing item stock, cost_per_unit, mrp, wholesale_price, tax, etc.
        item.current_stock = item.current_stock + effective_stock
        if computed_unit_cost > Decimal("0.00"):
            item.cost_per_unit = computed_unit_cost
        if mrp is not None and mrp > Decimal("0.00"):
            item.mrp = mrp
        if wholesale_price is not None and wholesale_price > Decimal("0.00"):
            item.wholesale_price = wholesale_price
        if tax_category:
            item.tax_category = tax_category
        if tax_rate is not None:
            item.tax_rate = tax_rate
        if clean_barcode and not item.barcode:
            item.barcode = clean_barcode
    else:
        # Item does not exist -> Create new InventoryItem
        if clean_barcode:
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

        item = InventoryItem(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            name=name.strip(),
            barcode=clean_barcode,
            unit=unit,
            category=category.strip(),
            current_stock=effective_stock,
            reorder_threshold=reorder_threshold,
            cost_per_unit=computed_unit_cost,
            mrp=mrp,
            wholesale_price=wholesale_price,
            tax_category=tax_category,
            tax_rate=tax_rate,
            is_active=True,
        )
        db.add(item)
        await db.flush()

    intake = None
    if effective_stock > Decimal("0.000"):
        batch_num = batch_number.strip() if batch_number else generate_batch_number()
        intake = StockIntake(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            batch_number=batch_num,
            quantity=effective_stock,
            initial_quantity=initial_stock,
            remaining_quantity=effective_stock,
            unit_cost=computed_unit_cost,
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
            quantity_change=effective_stock,
            resulting_stock=effective_stock,
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
            inventory_item_id=item.id,
            name=name.strip(),
            barcode=clean_barcode,
            price=selling_price,
            mrp=mrp,
            wholesale_price=wholesale_price,
            tax_category=tax_category,
            tax_rate=tax_rate,
            is_available=True,
            is_verification_required=False,
            unit_label=unit.value.lower(),
        )
        db.add(menu_item)

    from app.services.menu_service import invalidate_outlet_menu
    await invalidate_outlet_menu(db, outlet_id)

    await db.flush()
    await db.refresh(item)
    if intake:
        await db.refresh(intake)
    return item, intake


async def get_all_batches(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    item_id: uuid.UUID | None = None,
) -> list[dict[str, Any]]:
    """
    Get list of all intake batches for an outlet with FEFO / expiry status.
    Optionally filter by item_id.
    """
    now = datetime.utcnow()
    stmt = (
        select(StockIntake)
        .options(selectinload(StockIntake.item))
        .where(StockIntake.outlet_id == outlet_id)
    )
    if item_id:
        stmt = stmt.where(StockIntake.item_id == item_id)
    stmt = stmt.order_by(StockIntake.intake_date.desc())
    res = await db.execute(stmt)
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

        init_q = float(b.initial_quantity) if (b.initial_quantity is not None and float(b.initial_quantity) > 0) else float(b.quantity)
        usable_q = float(b.quantity)
        u_cost = float(b.unit_cost)
        total_billed = u_cost * usable_q
        purchase_cost = round(total_billed / init_q, 2) if init_q > 0 else u_cost

        result.append({
            "id": b.id,
            "outlet_id": b.outlet_id,
            "item_id": b.item_id,
            "item_name": b.item.name if b.item else "Unknown Item",
            "item_barcode": b.item.barcode if b.item else None,
            "unit": b.item.unit if b.item else InventoryUnitEnum.PCS,
            "batch_number": b.batch_number or f"BAT-{b.id.hex[:6]}",
            "quantity": b.quantity,
            "initial_quantity": b.initial_quantity if b.initial_quantity is not None else b.quantity,
            "remaining_quantity": b.remaining_quantity,
            "unit_cost": b.unit_cost,
            "purchase_unit_cost": purchase_cost,
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
    threshold_days: int | None = None,
) -> list[dict[str, Any]]:
    """
    Find active intake batches (remaining_quantity > 0) with expiry_date <= NOW() + threshold_days.
    Uses outlet's near_expiry_threshold_days setting if threshold_days is not provided.
    """
    if threshold_days is None:
        outlet = await db.get(Outlet, outlet_id)
        threshold_days = outlet.near_expiry_threshold_days if outlet else 7

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

    # Determine maximum stock available to write off
    max_available = item.current_stock

    # Draw down batch if specified or FEFO
    target_batch = None
    if data.batch_number:
        b_res = await db.execute(
            select(StockIntake).where(
                StockIntake.item_id == item.id,
                StockIntake.outlet_id == outlet_id,
                StockIntake.batch_number == data.batch_number,
            )
        )
        target_batch = b_res.scalar_one_or_none()
        if target_batch:
            max_available = target_batch.remaining_quantity

    if max_available <= Decimal("0.000"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot log wastage: '{item.name}' has 0 available stock.",
        )

    if waste_qty > max_available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Wastage quantity ({waste_qty}) exceeds available stock ({max_available} {item.unit.value}).",
        )

    if target_batch:
        target_batch.remaining_quantity = max(Decimal("0.000"), target_batch.remaining_quantity - waste_qty)
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


async def create_supplier(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    data: Any,
):
    """Create a new vendor/supplier record for an outlet."""
    from app.models.supplier import Supplier

    name_clean = data.name.strip()
    # Check if supplier with same name exists
    stmt = select(Supplier).where(
        Supplier.outlet_id == outlet_id,
        Supplier.name.ilike(name_clean),
        Supplier.is_active == True,  # noqa: E712
    )
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    if existing:
        return existing

    supplier = Supplier(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name=name_clean,
        phone=data.phone.strip() if data.phone else None,
        email=data.email.strip() if data.email else None,
        address=data.address.strip() if data.address else None,
        is_active=True,
    )
    db.add(supplier)
    await db.flush()
    await db.refresh(supplier)
    return supplier


async def list_suppliers(
    db: AsyncSession,
    outlet_id: uuid.UUID,
):
    """List all active suppliers for an outlet."""
    from app.models.supplier import Supplier

    stmt = (
        select(Supplier)
        .where(
            Supplier.outlet_id == outlet_id,
            Supplier.is_active == True,  # noqa: E712
        )
        .order_by(Supplier.name)
    )
    res = await db.execute(stmt)
    return res.scalars().all()


async def adjust_batch_stock(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    intake_id: uuid.UUID,
    staff_user: Any,
    data: Any,
):
    """
    Adjust batch stock:
    - PURCHASE_RETURN: Deduct batch & item stock, record StockLedger, create PurchaseReturn bill entry.
    - MANUAL_ADJUSTMENT: Deduct/adjust batch & item stock, record StockLedger.
    - VOID_BATCH: Zero out batch remaining stock, deduct from item stock, record StockLedger.
    """
    from app.models.purchase_return import PurchaseReturn

    # Fetch target batch
    intake_res = await db.execute(
        select(StockIntake).where(
            StockIntake.id == intake_id,
            StockIntake.outlet_id == outlet_id,
        )
    )
    batch = intake_res.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Stock intake batch not found")

    # Fetch parent item
    item_res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == batch.item_id,
            InventoryItem.outlet_id == outlet_id,
        )
    )
    item = item_res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Parent inventory item not found")

    adj_type = data.adjustment_type.upper()
    qty_change = Decimal(str(data.quantity))
    user_uuid = getattr(staff_user, "user_id", None) or getattr(staff_user, "id", None)

    if batch.remaining_quantity <= Decimal("0.000"):
        raise HTTPException(
            status_code=400,
            detail="Cannot adjust or return stock from a batch with 0 remaining stock."
        )

    if adj_type == "VOID_BATCH":
        # Zero out remaining stock for this batch
        deduct_qty = batch.remaining_quantity
        batch.remaining_quantity = Decimal("0.000")
        item.current_stock = max(Decimal("0.000"), item.current_stock - deduct_qty)

        change_enum = StockChangeTypeEnum.VOID_BATCH
        ledger_change = -deduct_qty
        notes_text = f"Batch #{batch.batch_number or batch.id} VOIDED. {data.notes or ''}".strip()

        ledger_entry = StockLedger(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            change_type=change_enum,
            quantity_change=ledger_change,
            resulting_stock=item.current_stock,
            created_by=user_uuid,
            unit_cost_snapshot=batch.unit_cost,
        )
        db.add(ledger_entry)
        await db.flush()
        return {"status": "success", "message": "Batch voided successfully", "batch_id": batch.id, "return_id": None}

    elif adj_type == "PURCHASE_RETURN":
        # Validate quantity <= remaining_quantity
        if qty_change > batch.remaining_quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot return {qty_change} units; only {batch.remaining_quantity} units remaining in batch."
            )

        batch.remaining_quantity = batch.remaining_quantity - qty_change
        item.current_stock = max(Decimal("0.000"), item.current_stock - qty_change)

        # Generate Return Bill Number (e.g. PR-YYYYMMDD-XXXX)
        now_str = datetime.utcnow().strftime("%Y%m%d")
        rand_str = uuid.uuid4().hex[:4].upper()
        return_number = f"PR-{now_str}-{rand_str}"

        supplier_name = data.supplier_name or batch.supplier_name or "General Supplier"
        
        # Calculate Purchase/Billed Unit Cost
        init_q = float(batch.initial_quantity) if (batch.initial_quantity is not None and float(batch.initial_quantity) > 0) else float(batch.quantity)
        usable_q = float(batch.quantity)
        u_cost = float(batch.unit_cost)
        calc_purchase_cost = Decimal(str(round((u_cost * usable_q) / init_q, 2))) if init_q > 0 else Decimal(str(u_cost))

        if getattr(data, "return_rate", None) is not None:
            unit_cost = Decimal(str(data.return_rate))
        else:
            unit_cost = calc_purchase_cost

        total_refund = unit_cost * qty_change

        purchase_return = PurchaseReturn(
            id=uuid.uuid4(),
            return_number=return_number,
            outlet_id=outlet_id,
            intake_id=batch.id,
            item_id=item.id,
            supplier_name=supplier_name,
            batch_number=batch.batch_number,
            quantity=qty_change,
            unit_cost=unit_cost,
            total_refund_amount=total_refund,
            reason=data.reason,
            notes=data.notes,
            created_by=user_uuid,
        )
        db.add(purchase_return)

        ledger_entry = StockLedger(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            change_type=StockChangeTypeEnum.PURCHASE_RETURN,
            quantity_change=-qty_change,
            resulting_stock=item.current_stock,
            created_by=user_uuid,
            unit_cost_snapshot=unit_cost,
        )
        db.add(ledger_entry)
        await db.flush()
        return {
            "status": "success",
            "message": "Purchase return processed and return bill generated",
            "batch_id": batch.id,
            "return_id": purchase_return.id,
            "return_number": purchase_return.return_number,
        }

    else:
        # MANUAL_ADJUSTMENT (Audit/Loss)
        if qty_change > batch.remaining_quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot adjust {qty_change} units; only {batch.remaining_quantity} units remaining in batch."
            )

        batch.remaining_quantity = batch.remaining_quantity - qty_change
        item.current_stock = max(Decimal("0.000"), item.current_stock - qty_change)

        ledger_entry = StockLedger(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            change_type=StockChangeTypeEnum.MANUAL_ADJUSTMENT,
            quantity_change=-qty_change,
            resulting_stock=item.current_stock,
            created_by=user_uuid,
            unit_cost_snapshot=batch.unit_cost,
        )
        db.add(ledger_entry)
        await db.flush()
        return {"status": "success", "message": "Manual adjustment completed", "batch_id": batch.id, "return_id": None}


async def list_purchase_returns(
    db: AsyncSession,
    outlet_id: uuid.UUID,
):
    """List all purchase returns / return bills for an outlet."""
    from app.models.purchase_return import PurchaseReturn
    from app.models.inventory_item import InventoryItem
    from app.models.user import User

    stmt = (
        select(PurchaseReturn, InventoryItem.name.label("item_name"), User.email.label("created_by_name"))
        .join(InventoryItem, PurchaseReturn.item_id == InventoryItem.id)
        .outerjoin(User, PurchaseReturn.created_by == User.id)
        .where(PurchaseReturn.outlet_id == outlet_id)
        .order_by(PurchaseReturn.created_at.desc())
    )
    res = await db.execute(stmt)
    results = []
    for row in res.all():
        pr, item_name, user_name = row[0], row[1], row[2]
        d = {
            "id": pr.id,
            "return_number": pr.return_number,
            "outlet_id": pr.outlet_id,
            "intake_id": pr.intake_id,
            "item_id": pr.item_id,
            "item_name": item_name,
            "supplier_name": pr.supplier_name,
            "batch_number": pr.batch_number,
            "quantity": pr.quantity,
            "unit_cost": pr.unit_cost,
            "total_refund_amount": pr.total_refund_amount,
            "reason": pr.reason,
            "notes": pr.notes,
            "created_by": pr.created_by,
            "created_by_name": user_name or "System Admin",
            "created_at": pr.created_at,
        }
        results.append(d)
    return results


async def get_purchase_return_by_id(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    return_id: uuid.UUID,
):
    """Get single purchase return bill by ID."""
    from app.models.purchase_return import PurchaseReturn
    from app.models.inventory_item import InventoryItem
    from app.models.user import User

    stmt = (
        select(PurchaseReturn, InventoryItem.name.label("item_name"), User.email.label("created_by_name"))
        .join(InventoryItem, PurchaseReturn.item_id == InventoryItem.id)
        .outerjoin(User, PurchaseReturn.created_by == User.id)
        .where(
            PurchaseReturn.id == return_id,
            PurchaseReturn.outlet_id == outlet_id,
        )
    )
    res = await db.execute(stmt)
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Purchase return bill not found")
    pr, item_name, user_name = row[0], row[1], row[2]
    return {
        "id": pr.id,
        "return_number": pr.return_number,
        "outlet_id": pr.outlet_id,
        "intake_id": pr.intake_id,
        "item_id": pr.item_id,
        "item_name": item_name,
        "supplier_name": pr.supplier_name,
        "batch_number": pr.batch_number,
        "quantity": pr.quantity,
        "unit_cost": pr.unit_cost,
        "total_refund_amount": pr.total_refund_amount,
        "reason": pr.reason,
        "notes": pr.notes,
        "created_by": pr.created_by,
        "created_by_name": user_name or "System Admin",
        "created_at": pr.created_at,
    }


async def restore_customer_return_to_batch(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    item_id: uuid.UUID,
    return_qty: Decimal,
    order_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
) -> None:
    """
    Restores customer return stock back to its original intake batch (or recent active batch),
    updating both StockIntake.remaining_quantity and InventoryItem.current_stock.
    """
    inv_item = await db.get(InventoryItem, item_id)
    if not inv_item:
        return

    remaining_to_restore = return_qty

    if order_id:
        # Trace original batch intake IDs from order's StockLedger AUTO_DEDUCTION entries
        stmt = (
            select(StockLedger)
            .where(
                StockLedger.reference_order_id == order_id,
                StockLedger.item_id == item_id,
                StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
                StockLedger.intake_id.is_not(None),
            )
            .order_by(StockLedger.created_at.desc())
        )
        res = await db.execute(stmt)
        ledger_entries = res.scalars().all()

        for entry in ledger_entries:
            if remaining_to_restore <= Decimal("0.000"):
                break
            if not entry.intake_id:
                continue

            batch = await db.get(StockIntake, entry.intake_id)
            if batch:
                restore_amount = min(remaining_to_restore, abs(entry.quantity_change))
                batch.remaining_quantity += restore_amount
                remaining_to_restore -= restore_amount

                # Log RESTOCK ledger entry linked to original intake batch
                restock_entry = StockLedger(
                    id=uuid.uuid4(),
                    outlet_id=outlet_id,
                    item_id=item_id,
                    intake_id=batch.id,
                    change_type=StockChangeTypeEnum.RESTOCK,
                    quantity_change=restore_amount,
                    resulting_stock=inv_item.current_stock + (return_qty - remaining_to_restore),
                    reference_order_id=order_id,
                    unit_cost_snapshot=batch.unit_cost,
                    created_by=user_id,
                )
                db.add(restock_entry)

    # If any remaining quantity unassigned (or no order_id), restore to most recent active batch
    if remaining_to_restore > Decimal("0.000"):
        recent_stmt = (
            select(StockIntake)
            .where(StockIntake.item_id == item_id, StockIntake.outlet_id == outlet_id)
            .order_by(StockIntake.intake_date.desc())
        )
        recent_res = await db.execute(recent_stmt)
        recent_batch = recent_res.scalars().first()

        if recent_batch:
            recent_batch.remaining_quantity += remaining_to_restore
            restock_entry = StockLedger(
                id=uuid.uuid4(),
                outlet_id=outlet_id,
                item_id=item_id,
                intake_id=recent_batch.id,
                change_type=StockChangeTypeEnum.RESTOCK,
                quantity_change=remaining_to_restore,
                resulting_stock=inv_item.current_stock + return_qty,
                reference_order_id=order_id,
                unit_cost_snapshot=recent_batch.unit_cost,
                created_by=user_id,
            )
            db.add(restock_entry)

    # Master stock update
    inv_item.current_stock += return_qty
    await db.flush()



