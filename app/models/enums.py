"""
Database enums — shared across all models.
"""

import enum


class RoleEnum(str, enum.Enum):
    SUPERADMIN = "SUPERADMIN"
    OUTLET_ADMIN = "OUTLET_ADMIN"
    MANAGER = "MANAGER"
    FLOOR_STAFF = "FLOOR_STAFF"
    CASHIER = "CASHIER"
    WAITER = "WAITER"
    DELIVERY_BOY = "DELIVERY_BOY"
    STAFF = "STAFF"


class PaymentModeEnum(str, enum.Enum):
    RAZORPAY_GATEWAY = "RAZORPAY_GATEWAY"
    PAY_AT_COUNTER = "PAY_AT_COUNTER"
    BOTH = "BOTH"


class OrderStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    PAID = "PAID"
    PAYMENT_PENDING = "PAYMENT_PENDING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class InventoryUnitEnum(str, enum.Enum):
    KG = "kg"
    G = "g"
    L = "l"
    ML = "ml"
    PCS = "pcs"


class StockChangeTypeEnum(str, enum.Enum):
    INTAKE = "INTAKE"
    AUTO_DEDUCTION = "AUTO_DEDUCTION"
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"
    RESTOCK = "RESTOCK"
    PURCHASE_RETURN = "PURCHASE_RETURN"
    VOID_BATCH = "VOID_BATCH"


class PricingModeEnum(str, enum.Enum):
    """Product pricing mode — determines how quantity and price interact."""
    WEIGHT_BASED = "WEIGHT_BASED"   # ₹ per kg/g — quantity entered as weight
    FIXED_UNIT = "FIXED_UNIT"       # ₹ per piece/pack — quantity entered as count


class SessionStatusEnum(str, enum.Enum):
    """Basket session lifecycle status."""
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"       # All orders reached terminal state
    EXPIRED = "EXPIRED"           # Session timed out
    TERMINATED = "TERMINATED"     # Staff manually ended session


# ------------------------------------------------------------------
# Order status state machine — valid transitions
# ------------------------------------------------------------------
# Any transition not in this mapping must be rejected with HTTP 400.
# ------------------------------------------------------------------
VALID_ORDER_TRANSITIONS: dict[OrderStatusEnum, set[OrderStatusEnum]] = {
    OrderStatusEnum.PENDING: {
        OrderStatusEnum.PENDING_VERIFICATION,
        OrderStatusEnum.PAYMENT_PENDING,
        OrderStatusEnum.PAID,
        OrderStatusEnum.COMPLETED,
        OrderStatusEnum.CANCELLED,
    },
    OrderStatusEnum.PENDING_VERIFICATION: {
        OrderStatusEnum.PAID,
        OrderStatusEnum.PAYMENT_PENDING,  # Pay At Counter: Accept/Confirm order
        OrderStatusEnum.COMPLETED,        # Direct basket verification & completion
        OrderStatusEnum.CANCELLED,
    },
    OrderStatusEnum.PAID: {
        OrderStatusEnum.PAYMENT_PENDING,
        OrderStatusEnum.COMPLETED,        # Razorpay: Accept/Confirm & Serve order
        OrderStatusEnum.REFUNDED,
    },
    OrderStatusEnum.PAYMENT_PENDING: {
        OrderStatusEnum.COMPLETED,        # Pay At Counter: Mark Paid
        OrderStatusEnum.CANCELLED,
    },
    # Terminal states — no outgoing transitions
    OrderStatusEnum.COMPLETED: set(),
    OrderStatusEnum.CANCELLED: set(),
    OrderStatusEnum.REFUNDED: set(),
}


def is_valid_transition(
    current: OrderStatusEnum, target: OrderStatusEnum
) -> bool:
    """Check if transitioning from current to target is allowed."""
    return target in VALID_ORDER_TRANSITIONS.get(current, set())


class NotificationTypeEnum(str, enum.Enum):
    NEAR_EXPIRY = "NEAR_EXPIRY"
    LOW_STOCK = "LOW_STOCK"
    RETURN_REQUEST = "RETURN_REQUEST"
    ABANDONED_CART = "ABANDONED_CART"
    PRICE_ALERT = "PRICE_ALERT"
    SHELF_LIFE_ALERT = "SHELF_LIFE_ALERT"


class NotificationChannelEnum(str, enum.Enum):
    IN_APP = "IN_APP"
    EMAIL = "EMAIL"
    WHATSAPP = "WHATSAPP"
