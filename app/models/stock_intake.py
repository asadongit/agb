"""
StockIntake model — log of daily stock intake/arrivals.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.inventory_item import InventoryItem
    from app.models.restaurant import Restaurant


class StockIntake(Base):
    __tablename__ = "stock_intakes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False
    )
    remaining_quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False, default=Decimal("0.000")
    )
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    supplier_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    intake_date: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    expiry_date: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, index=True
    )
    added_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Relationships
    restaurant: Mapped[Restaurant] = relationship("Restaurant")
    item: Mapped[InventoryItem] = relationship("InventoryItem")
