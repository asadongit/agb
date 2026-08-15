"""
Customer Admin Routes — listing, searching, registering, and deleting outlet customers.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, status

from app.dependencies import DBSession, RequireAdmin
from app.schemas.customer import CustomerCreate, CustomerResponse
from app.services.audit_service import log_action
from app.services.customer_service import (
    create_customer,
    delete_customer,
    list_customers,
)

router = APIRouter(prefix="/api/admin/customers", tags=["admin-customers"])


@router.get("", response_model=list[CustomerResponse])
async def list_customers_route(
    current_user: RequireAdmin,
    db: DBSession,
    search: str | None = Query(None, description="Search by customer name or phone"),
):
    """List all registered customers for current outlet with purchase history stats."""
    return await list_customers(db, current_user.outlet_id, search=search)


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer_route(
    data: CustomerCreate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Register a new customer for current outlet."""
    cust = await create_customer(db, current_user.outlet_id, data.name, data.phone)

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "CREATE",
        "Customer",
        str(cust.id),
        details={"name": cust.name, "phone": cust.phone},
    )

    return cust


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer_route(
    customer_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Delete a customer record for current outlet."""
    await delete_customer(db, current_user.outlet_id, customer_id)

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "DELETE",
        "Customer",
        str(customer_id),
    )
