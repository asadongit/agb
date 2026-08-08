"""
Restaurant model — the root tenant entity.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from decimal import Decimal

from sqlalchemy import Enum, String, Numeric, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from app.models.enums import PaymentModeEnum

if TYPE_CHECKING:
    from app.models.abandoned_cart import AbandonedCart
    from app.models.category import Category
    from app.models.customer import Customer
    from app.models.menu_item import MenuItem
    from app.models.order import Order
    from app.models.table_session import TableSession
    from app.models.user import User


class Restaurant(Base, TimestampMixin):
    __tablename__ = "restaurants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    slug: Mapped[str] = mapped_column(
        String(100), unique=True, index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    payment_mode: Mapped[PaymentModeEnum] = mapped_column(
        Enum(PaymentModeEnum, name="paymentmodeenum"),
        nullable=False,
    )
    razorpay_account_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    direct_upi_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    raw_upi_payload: Mapped[str | None] = mapped_column(
        String(1024), nullable=True
    )
    logo_url: Mapped[str | None] = mapped_column(
        String(1024), nullable=True
    )
    address: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    phone: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    gstin: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    fssai_no: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    session_duration_minutes: Mapped[int] = mapped_column(
        default=30, nullable=False,
    )
    public_basket_number: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default=None,
    )
    verification_amount_cutoff: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    flagged_item_ids: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )

    # Relationships
    users: Mapped[list[User]] = relationship(
        "User", back_populates="restaurant", cascade="all, delete-orphan"
    )
    categories: Mapped[list[Category]] = relationship(
        "Category", back_populates="restaurant", cascade="all, delete-orphan"
    )
    menu_items: Mapped[list[MenuItem]] = relationship(
        "MenuItem", back_populates="restaurant", cascade="all, delete-orphan"
    )
    orders: Mapped[list[Order]] = relationship(
        "Order", back_populates="restaurant", cascade="all, delete-orphan"
    )
    customers: Mapped[list[Customer]] = relationship(
        "Customer", back_populates="restaurant", cascade="all, delete-orphan"
    )
    table_sessions: Mapped[list[TableSession]] = relationship(
        "TableSession", back_populates="restaurant", cascade="all, delete-orphan"
    )
    abandoned_carts: Mapped[list[AbandonedCart]] = relationship(
        "AbandonedCart", back_populates="restaurant", cascade="all, delete-orphan"
    )
