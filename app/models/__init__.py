"""
Models package — import all models here so Alembic and Base.metadata
can discover them for autogenerate.
"""

from app.models.abandoned_cart import AbandonedCart
from app.models.audit_log import AuditLog
from app.models.bill_discount_approval import BillDiscountApproval
from app.models.category import Category
from app.models.customer import Customer
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.menu_item_recipe import MenuItemRecipe
from app.models.menu_item_variant import MenuItemVariant
from app.models.order import Order
"""
Models package — import all models here so Alembic and Base.metadata
can discover them for autogenerate.
"""

from app.models.abandoned_cart import AbandonedCart
from app.models.audit_log import AuditLog
from app.models.bill_discount_approval import BillDiscountApproval
from app.models.category import Category
from app.models.customer import Customer
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.menu_item_recipe import MenuItemRecipe
from app.models.menu_item_variant import MenuItemVariant
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.outlet import Outlet
from app.models.staff import Staff
from app.models.staff_audit_log import StaffAuditLog
from app.models.stock_intake import StockIntake
from app.models.stock_ledger import StockLedger
from app.models.purchase_return import PurchaseReturn
from app.models.supplier import Supplier
from app.models.basket_session import BasketSession
from app.models.user import User
from app.models.webhook_event import WebhookEvent
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

__all__ = [
    "AbandonedCart",
    "AuditLog",
    "BasketSession",
    "BillDiscountApproval",
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
    "Outlet",
    "PaymentModeEnum",
    "PricingModeEnum",
    "PurchaseReturn",
    "RoleEnum",
    "SessionStatusEnum",
    "Staff",
    "StaffAuditLog",
    "StockChangeTypeEnum",
    "StockIntake",
    "StockLedger",
    "Supplier",
    "User",
    "VALID_ORDER_TRANSITIONS",
    "WebhookEvent",
    "is_valid_transition",
]
