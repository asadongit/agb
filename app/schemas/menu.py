"""
Menu schemas — MenuItem (Product), MenuItemVariant, and public menu tree.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import PricingModeEnum
from app.schemas.common import BaseResponse, StrictSchema


# ── MenuItem (Product) ───────────────────────────────────────────────────


class MenuItemCreate(StrictSchema):
    category_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    price: Decimal = Field(ge=0, decimal_places=2)
    image_url: str | None = None
    is_available: bool = True
    is_on_offer: bool = False
    offer_price: Decimal | None = Field(None, ge=0, decimal_places=2)
    offer_label: str | None = None
    pricing_mode: PricingModeEnum = PricingModeEnum.FIXED_UNIT
    unit_label: str = Field(default="piece", min_length=1, max_length=50)


class MenuItemUpdate(StrictSchema):
    category_id: uuid.UUID | None = None
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    price: Decimal | None = Field(None, ge=0, decimal_places=2)
    image_url: str | None = None
    is_available: bool | None = None
    is_on_offer: bool | None = None
    offer_price: Decimal | None = Field(None, ge=0, decimal_places=2)
    offer_label: str | None = None
    pricing_mode: PricingModeEnum | None = None
    unit_label: str | None = Field(None, min_length=1, max_length=50)


class MenuItemResponse(BaseResponse):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    category_id: uuid.UUID
    name: str
    description: str | None
    price: Decimal
    image_url: str | None
    is_available: bool
    is_on_offer: bool = False
    offer_price: Decimal | None = None
    offer_label: str | None = None
    pricing_mode: PricingModeEnum = PricingModeEnum.FIXED_UNIT
    unit_label: str = "piece"
    created_at: datetime
    updated_at: datetime


# ── MenuItemVariant ──────────────────────────────────────────────────────


class VariantCreate(StrictSchema):
    name: str = Field(min_length=1, max_length=255)
    price_delta: Decimal = Field(default=Decimal("0.00"), decimal_places=2)
    is_available: bool = True


class VariantUpdate(StrictSchema):
    name: str | None = Field(None, min_length=1, max_length=255)
    price_delta: Decimal | None = Field(None, decimal_places=2)
    is_available: bool | None = None


class VariantResponse(BaseResponse):
    id: uuid.UUID
    menu_item_id: uuid.UUID
    name: str
    price_delta: Decimal
    is_available: bool


# ── Public menu tree (nested JSON) ──────────────────────────────────────


class PublicVariant(BaseResponse):
    id: uuid.UUID
    name: str
    price_delta: Decimal
    is_available: bool


class PublicMenuItem(BaseResponse):
    id: uuid.UUID
    name: str
    description: str | None
    price: Decimal
    image_url: str | None
    is_available: bool
    is_on_offer: bool = False
    offer_price: Decimal | None = None
    offer_label: str | None = None
    pricing_mode: PricingModeEnum = PricingModeEnum.FIXED_UNIT
    unit_label: str = "piece"
    variants: list[PublicVariant] = []


class PublicCategory(BaseResponse):
    id: uuid.UUID
    name: str
    display_order: int
    items: list[PublicMenuItem] = []


class PublicMenuResponse(BaseResponse):
    restaurant_name: str
    restaurant_slug: str
    categories: list[PublicCategory] = []
