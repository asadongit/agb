"""
Order model — customer orders scoped to a restaurant.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from app.models.enums import OrderStatusEnum

if TYPE_CHECKING:
    from app.models.basket_session import BasketSession
    from app.models.order_item import OrderItem
    from app.models.outlet import Outlet


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("basket_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    basket_number: Mapped[str] = mapped_column(String(50), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # NEVER use Float for money — Numeric(10,2) mapped to Python Decimal
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    status: Mapped[OrderStatusEnum] = mapped_column(
        Enum(OrderStatusEnum, name="orderstatusenum"),
        nullable=False,
        default=OrderStatusEnum.PENDING,
    )
    payment_reference: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    source: Mapped[str] = mapped_column(
        String(20), default="qr", nullable=False
    )
    is_auto_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_by_staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    subtotal_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    discount_type: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )
    discount_value: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    discount_reason: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    discount_status: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )
    payment_method: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )
    finalized_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )

    # Relationships
    outlet: Mapped[Outlet] = relationship(
        "Outlet", back_populates="orders"
    )
    session: Mapped[BasketSession | None] = relationship(
        "BasketSession", back_populates="orders"
    )
    items: Mapped[list[OrderItem]] = relationship(
        "OrderItem", back_populates="order", cascade="all, delete-orphan"
    )

