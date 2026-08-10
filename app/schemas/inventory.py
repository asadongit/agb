"""
Inventory schemas — CRUD requests/responses for inventory master, intakes, recipes, batches, and ledger.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import Field, computed_field

from app.models.enums import InventoryUnitEnum, StockChangeTypeEnum
from app.schemas.common import BaseResponse, StrictSchema


class InventoryItemCreate(StrictSchema):
    name: str = Field(min_length=1, max_length=255)
    barcode: str | None = Field(None, max_length=100)
    unit: InventoryUnitEnum
    category: str = Field(default="General", max_length=100)
    current_stock: Decimal = Field(default=Decimal("0.000"), ge=0)
    reorder_threshold: Decimal = Field(default=Decimal("0.000"), ge=0)
    cost_per_unit: Decimal = Field(default=Decimal("0.00"), ge=0)


class InventoryItemUpdate(StrictSchema):
    name: str | None = Field(None, min_length=1, max_length=255)
    barcode: str | None = Field(None, max_length=100)
    unit: InventoryUnitEnum | None = None
    category: str | None = Field(None, max_length=100)
    current_stock: Decimal | None = None
    reorder_threshold: Decimal | None = Field(None, ge=0)
    cost_per_unit: Decimal | None = Field(None, ge=0)
    is_active: bool | None = None


class InventoryItemResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    name: str
    barcode: str | None = None
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
    batch_number: str | None = Field(None, max_length=100)
    quantity: Decimal = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)
    supplier_name: str | None = Field(None, max_length=255)
    intake_date: datetime = Field(default_factory=datetime.utcnow)
    expiry_date: datetime | None = None
    notes: str | None = None


class StockIntakeResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    item_id: uuid.UUID
    batch_number: str | None = None
    quantity: Decimal
    remaining_quantity: Decimal = Decimal("0.000")
    unit_cost: Decimal
    supplier_name: str | None
    intake_date: datetime
    expiry_date: datetime | None = None
    added_by: uuid.UUID | None
    notes: str | None
    created_at: datetime


# ── Barcode Scanner Requests & Responses ────────────────────────────────


class ScanIncrementRequest(StrictSchema):
    barcode: str = Field(min_length=1, max_length=100)
    quantity: Decimal = Field(default=Decimal("1.000"), gt=0)
    batch_number: str | None = Field(None, max_length=100)
    expiry_date: datetime | None = None
    unit_cost: Decimal | None = Field(None, ge=0)


class ScanOnboardRequest(StrictSchema):
    barcode: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    category: str = Field(default="General", max_length=100)
    unit: InventoryUnitEnum = InventoryUnitEnum.PCS
    initial_stock: Decimal = Field(default=Decimal("1.000"), ge=0)
    cost_per_unit: Decimal = Field(default=Decimal("0.00"), ge=0)
    selling_price: Decimal | None = Field(None, ge=0)
    reorder_threshold: Decimal = Field(default=Decimal("5.000"), ge=0)
    batch_number: str | None = Field(None, max_length=100)
    expiry_date: datetime | None = None
    supplier_name: str | None = Field(None, max_length=255)


class ScanLookupResponse(BaseResponse):
    found: bool
    barcode: str
    item: InventoryItemResponse | None = None


class BatchDetailResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    item_barcode: str | None = None
    unit: InventoryUnitEnum
    batch_number: str
    quantity: Decimal
    remaining_quantity: Decimal
    unit_cost: Decimal
    supplier_name: str | None
    intake_date: datetime
    expiry_date: datetime | None
    status: str  # "ACTIVE", "EXPIRING_SOON", "EXPIRED", "DEPLETED"


# ── Recipes & Stock Ledger ───────────────────────────────────────────────


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
    outlet_id: uuid.UUID
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


class StockWastageRequest(StrictSchema):
    item_id: uuid.UUID
    quantity: Decimal = Field(gt=0, description="Quantity to write off as wastage")
    reason: str = Field(min_length=1, max_length=100, description="Reason: SPOILED_EXPIRED, DAMAGED_TRANSIT, AUDIT_CORRECTION, THEFT_LOST, OTHER")
    notes: str | None = Field(None, max_length=500)
    batch_number: str | None = Field(None, max_length=100)


class StockWastageResponse(BaseResponse):
    success: bool
    message: str
    item_id: uuid.UUID
    item_name: str
    quantity_wasted: Decimal
    new_current_stock: Decimal
    estimated_loss_amount: Decimal
    ledger_entry_id: uuid.UUID


InventoryItemCreate.model_rebuild()
InventoryItemUpdate.model_rebuild()
InventoryItemResponse.model_rebuild()
StockIntakeCreate.model_rebuild()
StockIntakeResponse.model_rebuild()
ScanIncrementRequest.model_rebuild()
ScanOnboardRequest.model_rebuild()
ScanLookupResponse.model_rebuild()
BatchDetailResponse.model_rebuild()
RecipeIngredientItem.model_rebuild()
RecipeSaveRequest.model_rebuild()
RecipeIngredientResponse.model_rebuild()
StockLedgerResponse.model_rebuild()
StockLedgerPageResponse.model_rebuild()
BatchExpiryAlertResponse.model_rebuild()
StockWastageRequest.model_rebuild()
StockWastageResponse.model_rebuild()
