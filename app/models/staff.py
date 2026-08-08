"""
Staff model — outlet staff profile, credentials, role, and PIN hash.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from app.models.enums import RoleEnum

if TYPE_CHECKING:
    from app.models.restaurant import Restaurant


class Staff(Base, TimestampMixin):
    __tablename__ = "staff"

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
    email: Mapped[str] = mapped_column(
        String(320), nullable=False, index=True
    )
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    role: Mapped[RoleEnum] = mapped_column(
        Enum(RoleEnum, name="roleenum"), nullable=False, default=RoleEnum.WAITER
    )
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    pin_hash: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active"
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    restaurant: Mapped[Restaurant] = relationship("Restaurant")
