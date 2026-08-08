"""
User model — staff and admin accounts, scoped to a restaurant.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import RoleEnum

if TYPE_CHECKING:
    from app.models.restaurant import Restaurant


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    restaurant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    role: Mapped[RoleEnum] = mapped_column(
        Enum(RoleEnum, name="roleenum"), nullable=False
    )
    email: Mapped[str] = mapped_column(
        String(320), unique=True, nullable=False, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        default=None, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=None, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Refresh tokens — stored hashed, one active per user
    refresh_token_hash: Mapped[str | None] = mapped_column(
        String(512), nullable=True
    )

    # Relationships
    restaurant: Mapped[Restaurant] = relationship(
        "Restaurant", back_populates="users"
    )
