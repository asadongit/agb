"""
StockLedger model — append-only audit trail of stock movements.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import StockChangeTypeEnum

if TYPE_CHECKING:
    from app.models.inventory_item import InventoryItem
    from app.models.order import Order
    from app.models.restaurant import Restaurant


class StockLedger(Base):
    __tablename__ = "stock_ledger"

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
    change_type: Mapped[StockChangeTypeEnum] = mapped_column(
        Enum(StockChangeTypeEnum, name="stockchangetypeenum"),
        nullable=False,
    )
    quantity_change: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False
    )
    resulting_stock: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False
    )
    reference_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    unit_cost_snapshot: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 4), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Relationships
    restaurant: Mapped[Restaurant] = relationship("Restaurant")
    item: Mapped[InventoryItem] = relationship("InventoryItem")
    reference_order: Mapped[Order | None] = relationship("Order")
