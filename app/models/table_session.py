"""
TableSession model — ties a customer name to a specific basket for a visit.
Sessions are active for a configurable duration (default 30 minutes) or until
all orders reach a terminal state.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from app.models.enums import SessionStatusEnum

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.order import Order
    from app.models.restaurant import Restaurant
    from app.models.user import User


class TableSession(Base, TimestampMixin):
    __tablename__ = "table_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    table_number: Mapped[str] = mapped_column(String(50), nullable=False)
    # Format: "{restaurant_id}:{table_number}:{normalized_name}"
    # normalized_name = name.strip().lower().replace(" ", "-")
    session_key: Mapped[str] = mapped_column(
        String(512), nullable=False, unique=True, index=True
    )
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[SessionStatusEnum] = mapped_column(
        Enum(SessionStatusEnum, name="sessionstatusenum"),
        nullable=False,
        default=SessionStatusEnum.ACTIVE,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False
    )
    # Staff termination metadata
    terminated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    terminated_reason: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )

    # Backward-compat hybrid property
    @hybrid_property
    def is_active(self) -> bool:
        return self.status == SessionStatusEnum.ACTIVE

    # Relationships
    restaurant: Mapped[Restaurant] = relationship(
        "Restaurant", back_populates="table_sessions"
    )
    customer: Mapped[Customer | None] = relationship(
        "Customer", back_populates="sessions"
    )
    orders: Mapped[list[Order]] = relationship(
        "Order", back_populates="session"
    )
    terminated_by: Mapped[User | None] = relationship(
        "User", foreign_keys=[terminated_by_id]
    )
