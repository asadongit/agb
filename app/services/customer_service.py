"""
Customer Service — listing, searching, creating, and compiling order history stats for outlet customers.
"""

from __future__ import annotations

import uuid
from typing import Any, Sequence

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.enums import OrderStatusEnum
from app.models.order import Order


async def list_customers(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    search: str | None = None,
) -> list[dict[str, Any]]:
    """
    List all registered customers for an outlet with computed total_orders and total_spent.
    Optionally filter by search query (name or phone).
    """
    stmt = select(Customer).where(Customer.outlet_id == outlet_id)
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            (Customer.name.ilike(q)) | (Customer.phone.ilike(q))
        )
    stmt = stmt.order_by(Customer.created_at.desc())

    res = await db.execute(stmt)
    customers = res.scalars().all()

    # Pre-fetch order stats for all customers in this outlet
    stats_stmt = (
        select(
            Order.customer_phone,
            func.count(Order.id).label("total_orders"),
            func.coalesce(func.sum(Order.total_amount), 0).label("total_spent"),
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.customer_phone.isnot(None),
            Order.status == OrderStatusEnum.PAID,
        )
        .group_by(Order.customer_phone)
    )
    stats_res = await db.execute(stats_stmt)
    stats_map = {row.customer_phone: (row.total_orders, float(row.total_spent)) for row in stats_res}

    result = []
    for c in customers:
        orders_count, spent = stats_map.get(c.phone, (0, 0.0))
        result.append({
            "id": c.id,
            "outlet_id": c.outlet_id,
            "name": c.name,
            "phone": c.phone,
            "total_orders": orders_count,
            "total_spent": spent,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
        })
    return result


async def create_customer(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    name: str,
    phone: str,
) -> Customer:
    """Create a new customer or return existing customer if phone matches."""
    clean_phone = phone.strip()
    clean_name = name.strip()

    existing = await db.execute(
        select(Customer).where(
            Customer.outlet_id == outlet_id,
            Customer.phone == clean_phone,
        )
    )
    cust = existing.scalar_one_or_none()
    if cust:
        cust.name = clean_name
        await db.flush()
        return cust

    cust = Customer(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name=clean_name,
        phone=clean_phone,
    )
    db.add(cust)
    await db.flush()
    return cust


async def delete_customer(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    customer_id: uuid.UUID,
) -> bool:
    """Delete a customer record by ID."""
    res = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.outlet_id == outlet_id,
        )
    )
    cust = res.scalar_one_or_none()
    if not cust:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    await db.delete(cust)
    await db.flush()
    return True


async def get_customer_analytics(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    phone: str,
    period: str = "all_time",
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    """
    Get customer purchase volume, category interest, and item interest over a selected timeframe.
    """
    from datetime import datetime, timedelta
    from app.models.order_item import OrderItem
    from app.models.category import Category
    from app.models.menu_item import MenuItem

    clean_phone = phone.strip()
    cust_res = await db.execute(
        select(Customer).where(
            Customer.outlet_id == outlet_id,
            Customer.phone == clean_phone,
        )
    )
    cust = cust_res.scalar_one_or_none()
    cust_name = cust.name if cust else "Walk-In Customer"

    # Base query for paid or completed orders
    order_stmt = select(Order.id, Order.total_amount, Order.created_at).where(
        Order.outlet_id == outlet_id,
        Order.customer_phone == clean_phone,
        Order.status.in_([OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED]),
    )

    now = datetime.utcnow()
    if period == "this_week":
        # Monday of current week
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        order_stmt = order_stmt.where(Order.created_at >= start)
    elif period == "last_1_week":
        start = now - timedelta(days=7)
        order_stmt = order_stmt.where(Order.created_at >= start)
    elif period == "last_month":
        start = now - timedelta(days=30)
        order_stmt = order_stmt.where(Order.created_at >= start)
    elif period == "last_6_months":
        start = now - timedelta(days=180)
        order_stmt = order_stmt.where(Order.created_at >= start)
    elif period == "last_year":
        start = now - timedelta(days=365)
        order_stmt = order_stmt.where(Order.created_at >= start)
    elif period == "custom" and start_date:
        try:
            s_dt = datetime.fromisoformat(start_date)
            order_stmt = order_stmt.where(Order.created_at >= s_dt)
        except Exception:
            pass
        if end_date:
            try:
                e_dt = datetime.fromisoformat(end_date)
                order_stmt = order_stmt.where(Order.created_at <= e_dt)
            except Exception:
                pass

    orders_res = await db.execute(order_stmt)
    matching_orders = orders_res.all()
    order_ids = [r.id for r in matching_orders]
    total_volume = sum(float(r.total_amount or 0.0) for r in matching_orders)
    total_orders = len(matching_orders)

    best_categories = []
    best_items = []

    if order_ids:
        # Category Interest
        cat_stmt = (
            select(
                func.coalesce(Category.name, "Uncategorized").label("category_name"),
                func.sum(OrderItem.quantity).label("total_qty"),
                func.sum(OrderItem.line_total).label("total_amount"),
            )
            .select_from(OrderItem)
            .outerjoin(MenuItem, OrderItem.menu_item_id == MenuItem.id)
            .outerjoin(Category, MenuItem.category_id == Category.id)
            .where(OrderItem.order_id.in_(order_ids))
            .group_by(func.coalesce(Category.name, "Uncategorized"))
            .order_by(func.sum(OrderItem.line_total).desc())
            .limit(10)
        )
        cat_res = await db.execute(cat_stmt)
        for r in cat_res.all():
            best_categories.append({
                "category_name": r.category_name,
                "total_quantity": float(r.total_qty or 0),
                "total_amount": float(r.total_amount or 0.0),
            })

        # Item Interest
        item_stmt = (
            select(
                OrderItem.item_name,
                func.sum(OrderItem.quantity).label("total_qty"),
                func.sum(OrderItem.line_total).label("total_amount"),
            )
            .where(OrderItem.order_id.in_(order_ids))
            .group_by(OrderItem.item_name)
            .order_by(func.sum(OrderItem.quantity).desc())
            .limit(10)
        )
        item_res = await db.execute(item_stmt)
        for r in item_res.all():
            best_items.append({
                "item_name": r.item_name or "Item",
                "total_quantity": float(r.total_qty or 0),
                "total_amount": float(r.total_amount or 0.0),
            })

    return {
        "customer_name": cust_name,
        "customer_phone": clean_phone,
        "period": period,
        "total_volume": total_volume,
        "total_orders": total_orders,
        "best_categories": best_categories,
        "best_items": best_items,
    }
