"""
FastAPI application factory with lifespan events.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.core.rate_limit import limiter
from app.core.redis import close_redis

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup: Ensure database tables exist and auto-create superadmin if missing
    try:
        import uuid
        from sqlalchemy import select
        from app.core.security import hash_password
        from app.database import Base, async_session_factory, engine
        from app.models.enums import RoleEnum
        from app.models.user import User

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with async_session_factory() as db:
            result = await db.execute(select(User).where(User.role == RoleEnum.SUPERADMIN))
            if not result.scalar_one_or_none():
                db.add(
                    User(
                        id=uuid.uuid4(),
                        email="superadmin@apnagreenbasket.com",
                        password_hash=hash_password("supersecret123"),
                        role=RoleEnum.SUPERADMIN,
                        outlet_id=None,
                    )
                )
                await db.commit()
                print("========================================")
                print("🔑 [Startup] Auto-created Default Superadmin:")
                print("   Email:    superadmin@apnagreenbasket.com")
                print("   Password: supersecret123")
                print("========================================")
    except Exception as err:
        print(f"[Startup Warning] Could not auto-create superadmin: {err}")

    yield
    # Shutdown
    await close_redis()


def create_app() -> FastAPI:
    """Build the FastAPI application with all routers and middleware."""
    app = FastAPI(
        title="ApnaGreen Basket API",
        description="Multi-outlet fruits, vegetables & drinks mart platform",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Rate limiting ────────────────────────────────────────────────
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── Routers ──────────────────────────────────────────────────────
    from app.routers.auth import router as auth_router
    from app.routers.admin.outlets import router as outlets_router
    from app.routers.admin.categories import router as categories_router
    from app.routers.admin.menu_items import router as menu_items_router
    from app.routers.admin.variants import router as variants_router
    from app.routers.admin.orders import router as orders_admin_router
    from app.routers.admin.inventory import router as inventory_router
    from app.routers.admin.staff import router as staff_router
    from app.routers.admin.analytics import router as analytics_router
    from app.routers.admin.billing import router as billing_router
    from app.routers.admin.sessions import router as admin_sessions_router
    from app.routers.public.menu import router as public_menu_router
    from app.routers.public.orders import router as public_orders_router
    from app.routers.public.sessions import router as sessions_router
    from app.routers.webhooks.razorpay import router as razorpay_router
    from app.routers.ws import router as ws_router
    from app.routers.upload import router as upload_router

    app.include_router(auth_router)
    app.include_router(outlets_router)
    app.include_router(categories_router)
    app.include_router(menu_items_router)
    app.include_router(variants_router)
    app.include_router(orders_admin_router)
    app.include_router(inventory_router)
    app.include_router(staff_router)
    app.include_router(analytics_router)
    app.include_router(billing_router)
    app.include_router(admin_sessions_router)
    app.include_router(public_menu_router)
    app.include_router(public_orders_router)
    app.include_router(sessions_router)
    app.include_router(razorpay_router)
    app.include_router(ws_router)
    app.include_router(upload_router)

    # ── Serve Uploaded Static Files ──────────────────────────────────
    from pathlib import Path
    from fastapi.staticfiles import StaticFiles
    upload_path = Path("uploads")
    upload_path.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_path)), name="uploads")

    # ── Health check ─────────────────────────────────────────────────
    @app.get("/health", tags=["health"])
    async def health():
        return {"status": "healthy", "version": "0.1.0"}

    return app


app = create_app()
