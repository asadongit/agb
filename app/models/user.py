"""
User model — superadmin and admin accounts, scoped to an outlet.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from app.models.enums import RoleEnum

if TYPE_CHECKING:
    from app.models.outlet import Outlet


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
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

    # Refresh tokens — stored hashed, one active per user
    refresh_token_hash: Mapped[str | None] = mapped_column(
        String(512), nullable=True
    )

    # Relationships
    outlet: Mapped[Outlet] = relationship(
        "Outlet", back_populates="users"
    )
