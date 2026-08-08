"""
Models package — import all models here so Alembic and Base.metadata
can discover them for autogenerate.
"""

from app.models.abandoned_cart import AbandonedCart
from app.models.audit_log import AuditLog
from app.models.category import Category
from app.models.customer import Customer
from app.models.enums import (
    InventoryUnitEnum,
    OrderStatusEnum,
    PaymentModeEnum,
    PricingModeEnum,
    RoleEnum,
    SessionStatusEnum,
    StockChangeTypeEnum,
    VALID_ORDER_TRANSITIONS,
    is_valid_transition,
)
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.menu_item_recipe import MenuItemRecipe
from app.models.menu_item_variant import MenuItemVariant
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.restaurant import Restaurant
from app.models.staff import Staff
from app.models.staff_audit_log import StaffAuditLog
from app.models.stock_intake import StockIntake
from app.models.stock_ledger import StockLedger
from app.models.table_session import TableSession
from app.models.user import User
from app.models.webhook_event import WebhookEvent

__all__ = [
    "AbandonedCart",
    "AuditLog",
    "Category",
    "Customer",
    "InventoryItem",
    "InventoryUnitEnum",
    "MenuItem",
    "MenuItemRecipe",
    "MenuItemVariant",
    "Order",
    "OrderItem",
    "OrderStatusEnum",
    "PaymentModeEnum",
    "PricingModeEnum",
    "Restaurant",
    "RoleEnum",
    "SessionStatusEnum",
    "Staff",
    "StaffAuditLog",
    "StockChangeTypeEnum",
    "StockIntake",
    "StockLedger",
    "TableSession",
    "User",
    "VALID_ORDER_TRANSITIONS",
    "WebhookEvent",
    "is_valid_transition",
]
