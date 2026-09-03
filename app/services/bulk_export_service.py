"""
Bulk Export Service — handles exporting Inventory, Menu Items, and Customers to CSV, Excel, and PDF formats.
"""
from __future__ import annotations

import io
import uuid
from decimal import Decimal
from typing import Any

import pandas as pd
from fpdf import FPDF
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.customer import Customer
from app.models.enums import OrderStatusEnum
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.schemas.bulk_operations import ExportFormatEnum


def generate_pdf_table(title: str, columns: list[str], rows: list[list[str]]) -> bytes:
    """Generate a PDF with a table of data."""
    pdf = FPDF(orientation="L")  # Landscape for wide tables
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, title, ln=True, align="C")
    pdf.ln(5)
    
    # Calculate column widths
    if not columns:
        return pdf.output()
        
    usable_width = pdf.w - 20
    col_width = usable_width / len(columns)
    
    # Draw header
    pdf.set_font("Helvetica", "B", 8)
    for col in columns:
        pdf.cell(col_width, 8, col, border=1, align="C")
    pdf.ln()
    
    # Draw rows
    pdf.set_font("Helvetica", "", 7)
    for row in rows:
        for val in row:
            # Clean string and truncate if too long
            str_val = str(val)[:30] if val is not None else ""
            pdf.cell(col_width, 7, str_val, border=1)
        pdf.ln()
    
    return pdf.output()


def _format_dataframe(df: pd.DataFrame, format: ExportFormatEnum, filename_base: str, title: str) -> tuple[bytes, str, str]:
    if format == ExportFormatEnum.CSV:
        buf = io.BytesIO()
        df.to_csv(buf, index=False)
        return buf.getvalue(), f"{filename_base}.csv", "text/csv"
        
    elif format == ExportFormatEnum.EXCEL:
        buf = io.BytesIO()
        df.to_excel(buf, index=False, engine="openpyxl")
        return buf.getvalue(), f"{filename_base}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        
    elif format == ExportFormatEnum.PDF:
        cols = list(df.columns)
        # Handle string conversion for PDF
        rows = df.astype(str).values.tolist()
        pdf_bytes = generate_pdf_table(title, cols, rows)
        return pdf_bytes, f"{filename_base}.pdf", "application/pdf"
        
    raise ValueError(f"Unsupported format: {format}")


async def export_inventory(db: AsyncSession, outlet_id: uuid.UUID, format: ExportFormatEnum) -> tuple[bytes, str, str]:
    """Export all active inventory items."""
    stmt = select(InventoryItem).where(
        InventoryItem.outlet_id == outlet_id,
        InventoryItem.is_active == True # noqa: E712
    ).order_by(InventoryItem.name)
    
    res = await db.execute(stmt)
    items = res.scalars().all()
    
    data = []
    for i, item in enumerate(items, start=2): # Row 1 is header, data starts at row 2
        exist_cost = str(item.cost_per_unit) if item.cost_per_unit else '""'
        exist_retail = str(item.retail_price) if item.retail_price else '""'
        exist_mrp = str(item.mrp) if item.mrp else '""'
        exist_whole = str(item.wholesale_price) if item.wholesale_price else '""'
        
        formula_H = f'=IF(F{i}>0, G{i}/F{i}, IF(E{i}>0, G{i}/E{i}, {exist_cost}))'
        formula_L = f'=IF(ISNUMBER(I{i}), IF(O{i}="MARGIN", H{i}/(1-I{i}/100), H{i}+(H{i}*I{i}/100)), {exist_mrp})'
        formula_M = f'=IF(ISNUMBER(J{i}), IF(O{i}="MARGIN", H{i}/(1-J{i}/100), H{i}+(H{i}*J{i}/100)), {exist_retail})'
        formula_N = f'=IF(ISNUMBER(K{i}), IF(O{i}="MARGIN", H{i}/(1-K{i}/100), H{i}+(H{i}*K{i}/100)), {exist_whole})'
        
        data.append({
            "Name": item.name,
            "Barcode": item.barcode or "",
            "Unit": item.unit.value,
            "Category": item.category,
            "Initial Qty": "",
            "Sorted Qty": "",
            "Total Billed": "",
            "Cost Per Unit": formula_H,
            "MRP Margin Pct": float(item.mrp_margin_pct) if item.mrp_margin_pct is not None else "",
            "Retail Margin Pct": float(item.retail_margin_pct) if item.retail_margin_pct is not None else "",
            "Wholesale Margin Pct": float(item.wholesale_margin_pct) if item.wholesale_margin_pct is not None else "",
            "MRP": formula_L,
            "Retail Price": formula_M,
            "Wholesale Price": formula_N,
            "Margin Type": item.margin_type.value if item.margin_type else "",
            "Supplier": "",
            "Expiry Date": "",
            "Tax Category": item.tax_category,
            "Tax Rate": float(item.tax_rate) if item.tax_rate is not None else "",
            "Reorder Threshold": float(item.reorder_threshold) if item.reorder_threshold is not None else "",
            "Shelf Life Alert Hrs": int(item.shelf_life_alert_hrs) if item.shelf_life_alert_hrs is not None else "",
            "Current Stock": float(item.current_stock) if item.current_stock is not None else "",
        })
        
    if format == ExportFormatEnum.EXCEL:
        current_row = len(items) + 2
        for i in range(current_row, current_row + 500):
            formula_H = f'=IF(F{i}>0, G{i}/F{i}, IF(E{i}>0, G{i}/E{i}, ""))'
            formula_L = f'=IF(ISNUMBER(I{i}), IF(O{i}="MARGIN", H{i}/(1-I{i}/100), H{i}+(H{i}*I{i}/100)), "")'
            formula_M = f'=IF(ISNUMBER(J{i}), IF(O{i}="MARGIN", H{i}/(1-J{i}/100), H{i}+(H{i}*J{i}/100)), "")'
            formula_N = f'=IF(ISNUMBER(K{i}), IF(O{i}="MARGIN", H{i}/(1-K{i}/100), H{i}+(H{i}*K{i}/100)), "")'
            
            data.append({
                "Name": "", "Barcode": "", "Unit": "", "Category": "",
                "Initial Qty": "", "Sorted Qty": "", "Total Billed": "",
                "Cost Per Unit": formula_H, "MRP Margin Pct": "", "Retail Margin Pct": "", "Wholesale Margin Pct": "",
                "MRP": formula_L, "Retail Price": formula_M, "Wholesale Price": formula_N,
                "Margin Type": "", "Supplier": "", "Expiry Date": "", "Tax Category": "", "Tax Rate": "",
                "Reorder Threshold": "", "Shelf Life Alert Hrs": "", "Current Stock": ""
            })
        
    df = pd.DataFrame(data)
    # Ensure columns match even if empty
    if df.empty:
        df = pd.DataFrame(columns=["Name", "Barcode", "Unit", "Category", "Initial Qty", "Sorted Qty", "Total Billed", "Cost Per Unit", "MRP Margin Pct", "Retail Margin Pct", "Wholesale Margin Pct", "MRP", "Retail Price", "Wholesale Price", "Margin Type", "Supplier", "Expiry Date", "Tax Category", "Tax Rate", "Reorder Threshold", "Shelf Life Alert Hrs", "Current Stock"])
        
    return _format_dataframe(df, format, "inventory_export", "Inventory Export")


async def export_menu_items(db: AsyncSession, outlet_id: uuid.UUID, format: ExportFormatEnum) -> tuple[bytes, str, str]:
    """Export all menu items."""
    stmt = select(MenuItem).options(selectinload(MenuItem.category)).where(
        MenuItem.outlet_id == outlet_id,
    ).order_by(MenuItem.name)
    
    res = await db.execute(stmt)
    items = res.scalars().all()
    
    data = []
    for item in items:
        data.append({
            "Name": item.name,
            "Category": item.category.name if item.category else "",
            "Price": str(item.price),
            "Barcode": item.barcode or "",
            "Description": item.description or "",
            "MRP": str(item.mrp) if item.mrp else "",
            "Wholesale Price": str(item.wholesale_price) if item.wholesale_price else "",
            "Evening Price": str(item.evening_price) if item.evening_price else "",
            "Offer Price": str(item.offer_price) if item.offer_price else "",
            "Offer Label": item.offer_label or "",
            "Tax Category": item.tax_category,
            "Tax Rate": str(item.tax_rate),
            "Pricing Mode": item.pricing_mode.value,
            "Unit Label": item.unit_label,
            "Is Available": str(item.is_available).lower(),
        })
        
    df = pd.DataFrame(data)
    if df.empty:
        df = pd.DataFrame(columns=["Name", "Category", "Price", "Barcode", "Description", "MRP", "Wholesale Price", "Evening Price", "Offer Price", "Offer Label", "Tax Category", "Tax Rate", "Pricing Mode", "Unit Label", "Is Available"])
        
    return _format_dataframe(df, format, "menu_items_export", "Menu Items Export")


async def export_customers(db: AsyncSession, outlet_id: uuid.UUID, format: ExportFormatEnum) -> tuple[bytes, str, str]:
    """Export all customers with aggregated stats."""
    
    # Subquery to aggregate orders
    orders_agg = (
        select(
            Order.customer_id,
            func.count(Order.id).label("total_orders"),
            func.sum(Order.total_amount).label("total_spent")
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.customer_id.isnot(None),
            Order.status.in_([OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED])
        )
        .group_by(Order.customer_id)
        .subquery()
    )
    
    stmt = (
        select(
            Customer,
            func.coalesce(orders_agg.c.total_orders, 0).label("total_orders"),
            func.coalesce(orders_agg.c.total_spent, Decimal("0.00")).label("total_spent"),
        )
        .outerjoin(orders_agg, Customer.id == orders_agg.c.customer_id)
        .where(Customer.outlet_id == outlet_id)
        .order_by(Customer.name)
    )
    
    res = await db.execute(stmt)
    rows = res.all()
    
    data = []
    for row in rows:
        customer = row.Customer
        total_orders = row.total_orders
        total_spent = row.total_spent
        
        data.append({
            "Phone": customer.phone,
            "Name": customer.name,
            "Loyalty Points": str(customer.loyalty_points),
            "Total Orders": str(total_orders),
            "Total Spent": str(total_spent),
            "Historical Spend": "", # Blank for re-import purposes
        })
        
    df = pd.DataFrame(data)
    if df.empty:
        df = pd.DataFrame(columns=["Phone", "Name", "Loyalty Points", "Total Orders", "Total Spent", "Historical Spend"])
        
    return _format_dataframe(df, format, "customers_export", "Customers Export")
