"""
Bulk Import Service — handles parsing and upserting CSV/Excel for Inventory, Menu Items, and Customers.
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime
from decimal import Decimal

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.customer import Customer
from app.models.enums import InventoryUnitEnum, OrderStatusEnum, PricingModeEnum
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.schemas.bulk_operations import BulkImportSummary
from app.services.menu_service import invalidate_outlet_menu


def read_import_file(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Read CSV or Excel file bytes into a pandas DataFrame."""
    if filename.lower().endswith((".xlsx", ".xls")):
        df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
    elif filename.lower().endswith(".csv"):
        df = pd.read_csv(io.BytesIO(file_bytes))
    else:
        raise ValueError("Unsupported file format. Use .csv, .xlsx, or .xls")
    
    # Normalize column headers
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    return df


def _get_val(row: pd.Series, col: str, default=None):
    if col not in row or pd.isna(row[col]):
        return default
    val = row[col]
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return default
    return val


def _get_decimal(row: pd.Series, col: str, default: Decimal | None = None) -> Decimal | None:
    val = _get_val(row, col, None)
    if val is None:
        return default
    try:
        return Decimal(str(val))
    except (TypeError, ValueError):
        return default


def _get_bool(row: pd.Series, col: str, default: bool = True) -> bool:
    val = _get_val(row, col, None)
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ("true", "1", "yes", "t", "y")
    return bool(val)


async def _resolve_category(db: AsyncSession, outlet_id: uuid.UUID, category_name: str) -> Category:
    name_strip = category_name.strip()
    res = await db.execute(
        select(Category).where(
            Category.outlet_id == outlet_id,
            Category.name.ilike(name_strip)
        )
    )
    cat = res.scalar_one_or_none()
    if not cat:
        cat = Category(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            name=name_strip,
            display_order=0,
        )
        db.add(cat)
        await db.flush()
    return cat


async def import_inventory(db: AsyncSession, outlet_id: uuid.UUID, file_bytes: bytes, filename: str) -> BulkImportSummary:
    """Import inventory items from CSV/Excel and auto-create MenuItems."""
    df = read_import_file(file_bytes, filename)
    
    required_cols = {"name", "unit"}
    if not required_cols.issubset(set(df.columns)):
        missing = required_cols - set(df.columns)
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
        
    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors = []
    
    for i, row in df.iterrows():
        row_num = i + 2 # 1-indexed, header is 1
        try:
            name = _get_val(row, "name")
            unit_str = _get_val(row, "unit")
            if not name or not unit_str:
                raise ValueError("Name or Unit cannot be empty")
                
            try:
                unit = InventoryUnitEnum(unit_str.lower())
            except ValueError:
                raise ValueError(f"Invalid unit '{unit_str}'. Must be one of: {', '.join(u.value for u in InventoryUnitEnum)}")
            
            barcode = _get_val(row, "barcode")
            category_name = _get_val(row, "category", "General")
            current_stock = _get_decimal(row, "current_stock", Decimal("0.000"))
            reorder_threshold = _get_decimal(row, "reorder_threshold", Decimal("5.000"))
            
            initial_qty = _get_decimal(row, "initial_qty")
            total_billed = _get_decimal(row, "total_billed")
            sorted_qty = _get_decimal(row, "sorted_qty")
            cost_per_unit = _get_decimal(row, "cost_per_unit")
            
            if cost_per_unit is None or cost_per_unit == Decimal("0.00"):
                if total_billed is not None and total_billed > 0:
                    if sorted_qty is not None and sorted_qty > 0:
                        cost_per_unit = total_billed / sorted_qty
                    elif initial_qty is not None and initial_qty > 0:
                        cost_per_unit = total_billed / initial_qty
            
            if cost_per_unit is None:
                cost_per_unit = Decimal("0.00")
            
            selling_price = _get_decimal(row, "selling_price")
            mrp = _get_decimal(row, "mrp")
            wholesale_price = _get_decimal(row, "wholesale_price")
            tax_category = _get_val(row, "tax_category", "GST 0%")
            tax_rate = _get_decimal(row, "tax_rate", Decimal("0.00"))
            shelf_life_alert_hrs_raw = _get_val(row, "shelf_life_alert_hrs")
            shelf_life_alert_hrs = int(shelf_life_alert_hrs_raw) if shelf_life_alert_hrs_raw else None
            
            # 1. Upsert InventoryItem
            res = await db.execute(
                select(InventoryItem).where(
                    InventoryItem.outlet_id == outlet_id,
                    InventoryItem.name.ilike(name)
                )
            )
            inv_item = res.scalar_one_or_none()
            
            if inv_item:
                inv_item.name = name
                inv_item.unit = unit
                inv_item.category = category_name
                inv_item.current_stock = current_stock
                inv_item.reorder_threshold = reorder_threshold
                inv_item.cost_per_unit = cost_per_unit
                inv_item.mrp = mrp
                inv_item.wholesale_price = wholesale_price
                inv_item.tax_category = tax_category
                inv_item.tax_rate = tax_rate
                inv_item.shelf_life_alert_hrs = shelf_life_alert_hrs
                if barcode:
                    inv_item.barcode = barcode
                updated_count += 1
            else:
                inv_item = InventoryItem(
                    id=uuid.uuid4(),
                    outlet_id=outlet_id,
                    name=name,
                    barcode=barcode,
                    unit=unit,
                    category=category_name,
                    current_stock=current_stock,
                    reorder_threshold=reorder_threshold,
                    cost_per_unit=cost_per_unit,
                    mrp=mrp,
                    wholesale_price=wholesale_price,
                    tax_category=tax_category,
                    tax_rate=tax_rate,
                    shelf_life_alert_hrs=shelf_life_alert_hrs,
                    is_active=True,
                )
                db.add(inv_item)
                created_count += 1
                
            await db.flush()
            
            # 2. Resolve Category
            category = await _resolve_category(db, outlet_id, category_name)
            
            # 3. Upsert MenuItem
            mi_res = await db.execute(
                select(MenuItem).where(
                    MenuItem.outlet_id == outlet_id,
                    MenuItem.inventory_item_id == inv_item.id
                )
            )
            menu_item = mi_res.scalar_one_or_none()
            
            # Determine price: selling_price > mrp > cost_per_unit > 0
            final_price = selling_price if selling_price is not None else (mrp if mrp is not None else cost_per_unit)
            
            if menu_item:
                menu_item.name = name
                menu_item.category_id = category.id
                if selling_price is not None:
                    menu_item.price = selling_price
                menu_item.mrp = mrp
                menu_item.wholesale_price = wholesale_price
                menu_item.tax_category = tax_category
                menu_item.tax_rate = tax_rate
                menu_item.unit_label = unit.value.lower()
                if barcode:
                    menu_item.barcode = barcode
            else:
                menu_item = MenuItem(
                    id=uuid.uuid4(),
                    outlet_id=outlet_id,
                    category_id=category.id,
                    inventory_item_id=inv_item.id,
                    name=name,
                    barcode=barcode,
                    price=final_price,
                    mrp=mrp,
                    wholesale_price=wholesale_price,
                    tax_category=tax_category,
                    tax_rate=tax_rate,
                    is_available=True,
                    is_verification_required=False,
                    pricing_mode=PricingModeEnum.FIXED_UNIT,
                    unit_label=unit.value.lower()
                )
                db.add(menu_item)
                
            await db.flush()
            
        except Exception as e:
            skipped_count += 1
            errors.append({"row": row_num, "field": "N/A", "message": str(e)})

    await invalidate_outlet_menu(db, outlet_id)
    return BulkImportSummary(
        total_rows=len(df),
        created=created_count,
        updated=updated_count,
        skipped=skipped_count,
        errors=errors
    )


async def import_menu_items(db: AsyncSession, outlet_id: uuid.UUID, file_bytes: bytes, filename: str) -> BulkImportSummary:
    """Import menu items from CSV/Excel directly (no inventory linkage)."""
    df = read_import_file(file_bytes, filename)
    
    required_cols = {"name", "category", "price"}
    if not required_cols.issubset(set(df.columns)):
        missing = required_cols - set(df.columns)
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
        
    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors = []
    
    for i, row in df.iterrows():
        row_num = i + 2
        try:
            name = _get_val(row, "name")
            category_name = _get_val(row, "category")
            price = _get_decimal(row, "price")
            
            if not name or not category_name or price is None:
                raise ValueError("Name, Category, and Price cannot be empty")
                
            barcode = _get_val(row, "barcode")
            description = _get_val(row, "description")
            mrp = _get_decimal(row, "mrp")
            wholesale_price = _get_decimal(row, "wholesale_price")
            evening_price = _get_decimal(row, "evening_price")
            offer_price = _get_decimal(row, "offer_price")
            offer_label = _get_val(row, "offer_label")
            tax_category = _get_val(row, "tax_category", "GST 0%")
            tax_rate = _get_decimal(row, "tax_rate", Decimal("0.00"))
            
            pm_str = _get_val(row, "pricing_mode", "FIXED_UNIT")
            try:
                pricing_mode = PricingModeEnum(pm_str.upper())
            except ValueError:
                pricing_mode = PricingModeEnum.FIXED_UNIT
                
            unit_label = _get_val(row, "unit_label", "piece")
            is_available = _get_bool(row, "is_available", True)
            
            is_on_offer = False
            if offer_price is not None and offer_price > 0:
                is_on_offer = True

            # 1. Resolve Category
            category = await _resolve_category(db, outlet_id, category_name)
            
            # 2. Upsert MenuItem
            mi_res = await db.execute(
                select(MenuItem).where(
                    MenuItem.outlet_id == outlet_id,
                    MenuItem.name.ilike(name)
                )
            )
            menu_item = mi_res.scalar_one_or_none()
            
            if menu_item:
                menu_item.category_id = category.id
                menu_item.name = name
                if barcode:
                    menu_item.barcode = barcode
                menu_item.description = description
                menu_item.price = price
                menu_item.mrp = mrp
                menu_item.wholesale_price = wholesale_price
                menu_item.evening_price = evening_price
                menu_item.offer_price = offer_price
                menu_item.offer_label = offer_label
                menu_item.is_on_offer = is_on_offer
                menu_item.tax_category = tax_category
                menu_item.tax_rate = tax_rate
                menu_item.pricing_mode = pricing_mode
                menu_item.unit_label = unit_label
                menu_item.is_available = is_available
                updated_count += 1
            else:
                menu_item = MenuItem(
                    id=uuid.uuid4(),
                    outlet_id=outlet_id,
                    category_id=category.id,
                    inventory_item_id=None,
                    name=name,
                    barcode=barcode,
                    description=description,
                    price=price,
                    mrp=mrp,
                    wholesale_price=wholesale_price,
                    evening_price=evening_price,
                    offer_price=offer_price,
                    offer_label=offer_label,
                    is_on_offer=is_on_offer,
                    tax_category=tax_category,
                    tax_rate=tax_rate,
                    pricing_mode=pricing_mode,
                    unit_label=unit_label,
                    is_available=is_available,
                    is_verification_required=False,
                )
                db.add(menu_item)
                created_count += 1
                
            await db.flush()
            
        except Exception as e:
            skipped_count += 1
            errors.append({"row": row_num, "field": "N/A", "message": str(e)})

    await invalidate_outlet_menu(db, outlet_id)
    return BulkImportSummary(
        total_rows=len(df),
        created=created_count,
        updated=updated_count,
        skipped=skipped_count,
        errors=errors
    )


async def import_customers(db: AsyncSession, outlet_id: uuid.UUID, file_bytes: bytes, filename: str) -> BulkImportSummary:
    """Import customers from CSV/Excel, and optionally create a legacy order for historical spend."""
    df = read_import_file(file_bytes, filename)
    
    required_cols = {"phone", "name"}
    if not required_cols.issubset(set(df.columns)):
        missing = required_cols - set(df.columns)
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
        
    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors = []
    
    LEGACY_DATE = datetime(2004, 2, 10, 0, 0, 0)
    
    for i, row in df.iterrows():
        row_num = i + 2
        try:
            phone = _get_val(row, "phone")
            name = _get_val(row, "name")
            
            if not phone or not name:
                raise ValueError("Phone and Name cannot be empty")
                
            phone = str(phone).strip()
            name = str(name).strip()
            
            loyalty_points = 0
            lp_val = _get_val(row, "loyalty_points")
            if lp_val is not None:
                try:
                    loyalty_points = int(float(lp_val))
                except (ValueError, TypeError):
                    pass
                    
            historical_spend = _get_decimal(row, "historical_spend", Decimal("0.00"))
            
            # 1. Upsert Customer
            cust_res = await db.execute(
                select(Customer).where(
                    Customer.outlet_id == outlet_id,
                    Customer.phone == phone
                )
            )
            customer = cust_res.scalar_one_or_none()
            
            if customer:
                customer.name = name
                customer.loyalty_points = loyalty_points
                updated_count += 1
            else:
                customer = Customer(
                    id=uuid.uuid4(),
                    outlet_id=outlet_id,
                    name=name,
                    phone=phone,
                    loyalty_points=loyalty_points
                )
                db.add(customer)
                created_count += 1
                
            await db.flush()
            
            # 2. Legacy Order Logic
            if historical_spend is not None and historical_spend > Decimal("0.00"):
                order_res = await db.execute(
                    select(Order).where(
                        Order.customer_id == customer.id,
                        Order.source == "legacy_import"
                    )
                )
                legacy_order = order_res.scalar_one_or_none()
                
                if legacy_order:
                    legacy_order.total_amount = historical_spend
                    legacy_order.subtotal_amount = historical_spend
                    legacy_order.customer_name = customer.name
                    legacy_order.customer_phone = customer.phone
                else:
                    new_order = Order(
                        id=uuid.uuid4(),
                        outlet_id=outlet_id,
                        session_id=None,
                        customer_id=customer.id,
                        basket_number="LEGACY-IMPORT",
                        customer_name=customer.name,
                        customer_phone=customer.phone,
                        total_amount=historical_spend,
                        subtotal_amount=historical_spend,
                        tax_amount=Decimal("0.00"),
                        status=OrderStatusEnum.COMPLETED,
                        source="legacy_import",
                        payment_method="legacy",
                        is_auto_verified=True,
                        created_at=LEGACY_DATE,
                        updated_at=LEGACY_DATE,
                        finalized_at=LEGACY_DATE,
                        paid_at=LEGACY_DATE,
                        confirmed_offline=False,
                        delivery_charge=Decimal("0.00"),
                        handling_charge=Decimal("0.00"),
                        loyalty_points_earned=0,
                        loyalty_points_redeemed=0,
                    )
                    db.add(new_order)
            
            await db.flush()
            
        except Exception as e:
            skipped_count += 1
            errors.append({"row": row_num, "field": "N/A", "message": str(e)})

    return BulkImportSummary(
        total_rows=len(df),
        created=created_count,
        updated=updated_count,
        skipped=skipped_count,
        errors=errors
    )
