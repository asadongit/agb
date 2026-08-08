"""
MenuItem model — individual products within a category.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from app.models.enums import PricingModeEnum

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.menu_item_variant import MenuItemVariant
    from app.models.restaurant import Restaurant


class MenuItem(Base, TimestampMixin):
    __tablename__ = "menu_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # NEVER use Float for money — Numeric(10,2) mapped to Python Decimal
    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    is_available: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    is_on_offer: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )
    offer_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    offer_label: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    # ── Dual pricing fields ──────────────────────────────────────────
    # WEIGHT_BASED: price is ₹ per kg/g, quantity entered as weight
    # FIXED_UNIT: price is ₹ per piece/pack, quantity entered as count
    pricing_mode: Mapped[PricingModeEnum] = mapped_column(
        Enum(PricingModeEnum, name="pricingmodeenum"),
        nullable=False,
        default=PricingModeEnum.FIXED_UNIT,
        server_default="FIXED_UNIT",
    )
    # Display unit label — e.g. "kg", "g", "piece", "pack", "bottle", "500ml"
    unit_label: Mapped[str] = mapped_column(
        String(50), nullable=False, default="piece", server_default="piece"
    )

    # Relationships
    restaurant: Mapped[Restaurant] = relationship(
        "Restaurant", back_populates="menu_items"
    )
    category: Mapped[Category] = relationship(
        "Category", back_populates="menu_items"
    )
    variants: Mapped[list[MenuItemVariant]] = relationship(
        "MenuItemVariant", back_populates="menu_item", cascade="all, delete-orphan"
    )
