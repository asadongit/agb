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
                    InventoryItem.restaurant_id == order.restaurant_id,
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
                    StockIntake.restaurant_id == order.restaurant_id,
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
                restaurant_id=order.restaurant_id,
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
                InventoryItem.restaurant_id == order.restaurant_id,
            )
        )
        inv_item = inv_res.scalar_one_or_none()
        if not inv_item:
            continue

        inv_item.current_stock = inv_item.current_stock + restore_qty

        restock_ledger = StockLedger(
            id=uuid.uuid4(),
            restaurant_id=order.restaurant_id,
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
    restaurant_id: uuid.UUID,
    data: InventoryItemCreate,
) -> InventoryItem:
    """Create a new ingredient in the master list for an outlet."""
    item = InventoryItem(
        id=uuid.uuid4(),
        restaurant_id=restaurant_id,
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
    restaurant_id: uuid.UUID,
    item_id: uuid.UUID,
    data: InventoryItemUpdate,
) -> InventoryItem:
    """Update an ingredient master record."""
    res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.restaurant_id == restaurant_id,
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


async def log_stock_intake(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    user_id: uuid.UUID | None,
    data: StockIntakeCreate,
) -> StockIntake:
    """
    Log a daily stock arrival:
    1. Creates StockIntake record
    2. Increments InventoryItem.current_stock
    3. Updates InventoryItem.cost_per_unit with new unit cost
    4. Appends StockLedger entry (change_type="intake")
    """
    res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == data.item_id,
            InventoryItem.restaurant_id == restaurant_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    intake = StockIntake(
        id=uuid.uuid4(),
        restaurant_id=restaurant_id,
        item_id=item.id,
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
        restaurant_id=restaurant_id,
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


async def save_menu_item_recipe(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
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
    restaurant_id: uuid.UUID,
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
            StockIntake.restaurant_id == restaurant_id,
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
