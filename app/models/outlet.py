"""
Outlet model — the root tenant entity (mart, store, or grocery outlet).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from decimal import Decimal

from sqlalchemy import Enum, Integer, JSON, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from .enums import PaymentModeEnum

if TYPE_CHECKING:
    from app.models.abandoned_cart import AbandonedCart
    from app.models.basket_session import BasketSession
    from app.models.category import Category
    from app.models.customer import Customer
    from app.models.menu_item import MenuItem
    from app.models.order import Order
    from app.models.staff import Staff
    from app.models.user import User


class Outlet(Base, TimestampMixin):
    __tablename__ = "outlets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    slug: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    payment_mode: Mapped[PaymentModeEnum] = mapped_column(
        Enum(PaymentModeEnum, name="paymentmodeenum"),
        nullable=False,
        default=PaymentModeEnum.PAY_AT_COUNTER,
    )
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fssai_no: Mapped[str | None] = mapped_column(String(50), nullable=True)
    direct_upi_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    razorpay_account_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    raw_upi_payload: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    session_duration_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=30
    )
    session_grace_period_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=5
    )
    public_basket_number: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default=None
    )
    # Verification Rules (Anti-theft)
    verification_amount_cutoff: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True, default=None
    )
    flagged_item_ids: Mapped[list[str] | None] = mapped_column(
        JSON, nullable=True, default=list
    )

    # Relationships
    staff: Mapped[list[Staff]] = relationship(
        "Staff", back_populates="outlet", cascade="all, delete-orphan"
    )
    users: Mapped[list[User]] = relationship(
        "User", back_populates="outlet", cascade="all, delete-orphan"
    )
    categories: Mapped[list[Category]] = relationship(
        "Category", back_populates="outlet", cascade="all, delete-orphan"
    )
    menu_items: Mapped[list[MenuItem]] = relationship(
        "MenuItem", back_populates="outlet", cascade="all, delete-orphan"
    )
    orders: Mapped[list[Order]] = relationship(
        "Order", back_populates="outlet", cascade="all, delete-orphan"
    )
    customers: Mapped[list[Customer]] = relationship(
        "Customer", back_populates="outlet", cascade="all, delete-orphan"
    )
    basket_sessions: Mapped[list[BasketSession]] = relationship(
        "BasketSession", back_populates="outlet", cascade="all, delete-orphan"
    )
    abandoned_carts: Mapped[list[AbandonedCart]] = relationship(
        "AbandonedCart", back_populates="outlet", cascade="all, delete-orphan"
    )
