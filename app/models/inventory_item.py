"""
InventoryItem model — ingredient master per outlet.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from app.models.enums import InventoryUnitEnum

if TYPE_CHECKING:
    from app.models.restaurant import Restaurant


class InventoryItem(Base, TimestampMixin):
    __tablename__ = "inventory_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[InventoryUnitEnum] = mapped_column(
        Enum(InventoryUnitEnum, name="inventoryunitenum"),
        nullable=False,
        default=InventoryUnitEnum.PCS,
    )
    category: Mapped[str] = mapped_column(
        String(100), nullable=False, default="General"
    )
    current_stock: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False, default=Decimal("0.000")
    )
    reorder_threshold: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False, default=Decimal("0.000")
    )
    cost_per_unit: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # Relationships
    restaurant: Mapped[Restaurant] = relationship("Restaurant")
