"""
Customer model — diner identity (separate from staff User).
A customer is uniquely identified by (restaurant_id, phone).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.restaurant import Restaurant
    from app.models.table_session import TableSession


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("restaurant_id", "phone", name="uq_customers_restaurant_phone"),
    )

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
    phone: Mapped[str] = mapped_column(String(20), nullable=False)

    # Relationships
    restaurant: Mapped[Restaurant] = relationship(
        "Restaurant", back_populates="customers"
    )
    sessions: Mapped[list[TableSession]] = relationship(
        "TableSession", back_populates="customer"
    )
