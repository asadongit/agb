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
