"""
Customer model — shopper/diner identity (separate from staff User).
A customer is uniquely identified by (outlet_id, phone).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.basket_session import BasketSession
    from app.models.outlet import Outlet


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("outlet_id", "phone", name="uq_customers_outlet_phone"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)

    # Relationships
    outlet: Mapped[Outlet] = relationship(
        "Outlet", back_populates="customers"
    )
    sessions: Mapped[list[BasketSession]] = relationship(
        "BasketSession", back_populates="customer"
    )
