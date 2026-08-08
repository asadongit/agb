"""
Database seed script — populates initial restaurant, users, categories, menu items, and variants.
Works with both SQLite (zero-dependency) and PostgreSQL.

Usage:
    python seed.py
"""

import asyncio
import uuid
from decimal import Decimal

from sqlalchemy import select

from app.core.security import hash_password
from app.database import Base, async_session_factory, engine
from app.models.category import Category
from app.models.enums import PaymentModeEnum, RoleEnum
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.models.restaurant import Restaurant
from app.models.user import User


async def seed_data():
    print("[Seed] Initializing database tables...")
    # Create all tables if they don't exist yet (for SQLite / local dev)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as db:
        # Check if restaurant already exists
        existing = await db.execute(
            select(Restaurant).where(Restaurant.slug == "oasis-bistro")
        )
        if existing.scalar_one_or_none():
            print("[Seed] Restaurant 'oasis-bistro' already exists. Skipping seed.")
            return

        # 1. Create Restaurant
        restaurant = Restaurant(
            id=uuid.uuid4(),
            slug="oasis-bistro",
            name="L'Oasis Modern Bistro",
            payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
            razorpay_account_id="acc_demo123",
        )
        db.add(restaurant)
        await db.flush()

        # 2. Create Admin User
        admin_user = User(
            id=uuid.uuid4(),
            restaurant_id=restaurant.id,
            role=RoleEnum.RESTAURANT_ADMIN,
            email="admin@oasisbistro.com",
            password_hash=hash_password("admin123456"),
        )
        db.add(admin_user)

        # 2b. Create Superadmin User
        superadmin_user = User(
            id=uuid.uuid4(),
            restaurant_id=restaurant.id,
            role=RoleEnum.SUPERADMIN,
            email="superadmin@rushtable.com",
            password_hash=hash_password("admin123456"),
        )
        db.add(superadmin_user)

        # 3. Create Categories & Menu Items
        cat1 = Category(
            id=uuid.uuid4(),
            restaurant_id=restaurant.id,
            name="Chef's Specials",
            display_order=1,
        )
        cat2 = Category(
            id=uuid.uuid4(),
            restaurant_id=restaurant.id,
            name="Gourmet Mains",
            display_order=2,
        )
        cat3 = Category(
            id=uuid.uuid4(),
            restaurant_id=restaurant.id,
            name="Artisanal Beverages",
            display_order=3,
        )
        db.add_all([cat1, cat2, cat3])
        await db.flush()

        # Dish 1
        item1 = MenuItem(
            id=uuid.uuid4(),
            restaurant_id=restaurant.id,
            category_id=cat1.id,
            name="Truffle Parmesan Hand-Cut Fries",
            description="Triple-cooked russet potatoes tossed in black truffle oil, aged Parmigiano-Reggiano, and rosemary garlic aioli.",
            price=Decimal("2.00"),
            image_url="https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80",
            is_available=True,
        )
        # Dish 2
        item2 = MenuItem(
            id=uuid.uuid4(),
            restaurant_id=restaurant.id,
            category_id=cat1.id,
            name="Wood-Fired Burrata & Heirloom Pizza",
            description="San Marzano tomato base, fresh creamy burrata, heirloom tomatoes, fresh basil, and aged balsamic glaze reduction.",
            price=Decimal("680.00"),
            image_url="https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
            is_available=True,
        )
        # Dish 3
        item3 = MenuItem(
            id=uuid.uuid4(),
            restaurant_id=restaurant.id,
            category_id=cat2.id,
            name="Smoked Bacon & Wagyu Smash Burger",
            description="Double Wagyu beef patty, applewood smoked bacon, aged cheddar, caramelised onions, and house sauce on toasted brioche.",
            price=Decimal("520.00"),
            image_url="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
            is_available=True,
        )
        # Dish 4 (Sold out example)
        item4 = MenuItem(
            id=uuid.uuid4(),
            restaurant_id=restaurant.id,
            category_id=cat2.id,
            name="Artisan Wild Mushroom Pappardelle",
            description="Handmade pappardelle, porcini cream sauce, toasted pine nuts, fresh thyme, and shaved Parmigiano.",
            price=Decimal("580.00"),
            image_url="https://images.unsplash.com/photo-1621996346565-e3d5d6281320?auto=format&fit=crop&w=600&q=80",
            is_available=False,
        )
        # Dish 5
        item5 = MenuItem(
            id=uuid.uuid4(),
            restaurant_id=restaurant.id,
            category_id=cat3.id,
            name="Iced Hibiscus & Yuzu Sparkler",
            description="Cold-brewed organic hibiscus tea, Japanese yuzu citrus, sparkling mineral water, and mint syrup.",
            price=Decimal("240.00"),
            image_url="https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
            is_available=True,
        )
        db.add_all([item1, item2, item3, item4, item5])
        await db.flush()

        # Variants
        v1a = MenuItemVariant(
            id=uuid.uuid4(),
            menu_item_id=item1.id,
            name="Regular Portion",
            price_delta=Decimal("0.00"),
        )
        v1b = MenuItemVariant(
            id=uuid.uuid4(),
            menu_item_id=item1.id,
            name="Sharing Platter",
            price_delta=Decimal("160.00"),
        )
        v2a = MenuItemVariant(
            id=uuid.uuid4(),
            menu_item_id=item2.id,
            name="Personal (10\")",
            price_delta=Decimal("0.00"),
        )
        v2b = MenuItemVariant(
            id=uuid.uuid4(),
            menu_item_id=item2.id,
            name="Large (14\")",
            price_delta=Decimal("240.00"),
        )
        db.add_all([v1a, v1b, v2a, v2b])

        await db.commit()
        print("[Seed] Seeding complete!")
        print("       Restaurant Slug: oasis-bistro")
        print("       Admin Login:     admin@oasisbistro.com / admin123456")


if __name__ == "__main__":
    asyncio.run(seed_data())
