"""
Inventory schemas — CRUD requests/responses for inventory master, intakes, recipes, and ledger.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import InventoryUnitEnum, StockChangeTypeEnum
from app.schemas.common import BaseResponse, StrictSchema


class InventoryItemCreate(StrictSchema):
    name: str = Field(min_length=1, max_length=255)
    unit: InventoryUnitEnum
    category: str = Field(default="General", max_length=100)
    current_stock: Decimal = Field(default=Decimal("0.000"), ge=0)
    reorder_threshold: Decimal = Field(default=Decimal("0.000"), ge=0)
    cost_per_unit: Decimal = Field(default=Decimal("0.00"), ge=0)


class InventoryItemUpdate(StrictSchema):
    name: str | None = Field(None, min_length=1, max_length=255)
    unit: InventoryUnitEnum | None = None
    category: str | None = Field(None, max_length=100)
    current_stock: Decimal | None = None
    reorder_threshold: Decimal | None = Field(None, ge=0)
    cost_per_unit: Decimal | None = Field(None, ge=0)
    is_active: bool | None = None


class InventoryItemResponse(BaseResponse):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    name: str
    unit: InventoryUnitEnum
    category: str
    current_stock: Decimal
    reorder_threshold: Decimal
    cost_per_unit: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime


class StockIntakeCreate(StrictSchema):
    item_id: uuid.UUID
    quantity: Decimal = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)
    supplier_name: str | None = Field(None, max_length=255)
    intake_date: datetime = Field(default_factory=datetime.utcnow)
    expiry_date: datetime | None = None
    notes: str | None = None


class StockIntakeResponse(BaseResponse):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    item_id: uuid.UUID
    quantity: Decimal
    remaining_quantity: Decimal = Decimal("0.000")
    unit_cost: Decimal
    supplier_name: str | None
    intake_date: datetime
    expiry_date: datetime | None = None
    added_by: uuid.UUID | None
    notes: str | None
    created_at: datetime


class RecipeIngredientItem(StrictSchema):
    inventory_item_id: uuid.UUID
    quantity_required: Decimal = Field(gt=0)
    unit: InventoryUnitEnum


class RecipeSaveRequest(StrictSchema):
    menu_item_id: uuid.UUID
    ingredients: list[RecipeIngredientItem] = Field(default_factory=list)


class RecipeIngredientResponse(BaseResponse):
    id: uuid.UUID
    menu_item_id: uuid.UUID
    inventory_item_id: uuid.UUID
    inventory_item_name: str | None = None
    quantity_required: Decimal
    unit: InventoryUnitEnum


class StockLedgerResponse(BaseResponse):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str | None = None
    unit: InventoryUnitEnum | None = None
    change_type: StockChangeTypeEnum
    quantity_change: Decimal
    resulting_stock: Decimal
    reference_order_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: datetime


class StockLedgerPageResponse(BaseResponse):
    items: list[StockLedgerResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class BatchExpiryAlertResponse(BaseResponse):
    intake_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    unit: InventoryUnitEnum
    remaining_quantity: Decimal
    expiry_date: datetime
    days_until_expiry: int
    status: str  # "EXPIRED" or "EXPIRING_SOON"


InventoryItemCreate.model_rebuild()
InventoryItemUpdate.model_rebuild()
InventoryItemResponse.model_rebuild()
StockIntakeCreate.model_rebuild()
StockIntakeResponse.model_rebuild()
RecipeIngredientItem.model_rebuild()
RecipeSaveRequest.model_rebuild()
RecipeIngredientResponse.model_rebuild()
StockLedgerResponse.model_rebuild()
StockLedgerPageResponse.model_rebuild()
BatchExpiryAlertResponse.model_rebuild()
