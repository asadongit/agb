# Conventions & Standards

> Read this file at the start of every coding session. Violations of the "Things That Must Never Happen" section are treated as critical bugs — fix immediately, no exceptions.

---

## 🚫 Things That Must Never Happen

These are non-negotiable invariants. Every PR/commit must be checked against this list.

- [ ] **Money fields as floats.** `price`, `total_amount`, `unit_price`, `price_delta` — all MUST use `Numeric(10, 2)` in SQLAlchemy and `Decimal` in Python. Never `Float`. Float rounding errors cause real accounting discrepancies.

- [ ] **Tenant ID from client input.** Every tenant-scoped DB query MUST filter by `restaurant_id` extracted from the decoded JWT — never from path params, query params, or request body. Use the shared `get_tenant_scoped_query` helper so this is enforced in one place.

- [ ] **Razorpay webhook parsed before verification.** The raw request body bytes MUST be read and the `X-Razorpay-Signature` verified BEFORE any JSON parsing. Parsing first and re-serializing to verify will produce signature mismatches or false positives.

- [ ] **Duplicate webhook processing.** Webhook events MUST be idempotent. Check `WebhookEvent.event_id` in the DB before processing. If it exists, return `200 OK` immediately and do nothing else.

- [ ] **JWT in WebSocket query params.** JWTs MUST NEVER be passed as raw `?token=...` query parameters — they get logged by proxies, load balancers, and browser history. Use the short-lived, single-use ticket flow via `POST /api/ws-ticket`.

- [ ] **Arbitrary order status writes.** Order status transitions MUST follow the state machine defined in [architecture.md](./architecture.md#diagram-3-order-status-state-machine). Any transition not on the graph (e.g. `COMPLETED → PENDING`) must be rejected with HTTP 400.

- [ ] **Hardcoded secrets.** Database URLs, API keys, webhook secrets, JWT signing keys — all MUST come from environment variables. Nothing sensitive in source code, logs, or error responses.

- [ ] **Manual DB schema changes.** All schema changes go through Alembic migrations. Never run raw `ALTER TABLE` in production.

- [ ] **Trusting client-submitted totals.** Order totals MUST be computed server-side from stored `MenuItem` / `MenuItemVariant` prices. Never accept a total from the frontend.

- [ ] **Store plain text staff PINs.** 4-digit staff PINs MUST be hashed using `bcrypt` before database storage. Plaintext PINs are strictly prohibited.

- [ ] **Recompute historical profit margins from live ingredient cost.** Profit margins and COGS over historical time ranges MUST use the `unit_cost_snapshot` captured on `StockLedger` at deduction time, never live `InventoryItem.cost_per_unit`.

- [ ] **Allow Cashiers to self-approve discounts.** Discounts created by non-Manager/Admin roles (`CASHIER`, `WAITER`) MUST default to `discount_status = "PENDING_APPROVAL"` and create a `BillDiscountApproval` entry requiring Manager/Admin review.

---

## Folder Structure

```
restaurant-app/
├── docs/                          # Project documentation
│   ├── architecture.md            # Merged spec + diagrams (canonical reference)
│   ├── codebase-walkthrough.md    # Fast onboarding guide & 10 invariants
│   ├── conventions.md             # This file
│   ├── decisions.md               # ADR-style decision log
│   └── progress.md                # Build order checklist
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app factory, lifespan events
│   ├── config.py                  # Pydantic Settings (env vars)
│   ├── database.py                # SQLAlchemy engine, sessionmaker, Base
│   ├── dependencies.py            # Shared FastAPI dependencies (get_db, get_current_user, require_permission)
│   ├── models/                    # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── restaurant.py
│   │   ├── user.py                # User model with role & bcrypt pin_hash
│   │   ├── staff_audit_log.py     # Staff action audit log
│   │   ├── category.py
│   │   ├── menu_item.py
│   │   ├── menu_item_variant.py
│   │   ├── inventory_item.py      # Per-outlet ingredient master
│   │   ├── stock_intake.py        # Stock intake & restocking records
│   │   ├── menu_item_recipe.py    # Recipe mapping to ingredients
│   │   ├── stock_ledger.py        # Stock movement ledger with unit_cost_snapshot
│   │   ├── order.py               # Order model with source & discount fields
│   │   ├── order_item.py          # Order items with snapshot unit_price & line_total
│   │   ├── bill_discount_approval.py # Discount approval requests
│   │   ├── webhook_event.py
│   │   └── enums.py               # RoleEnum, PaymentModeEnum, OrderStatusEnum, etc.
│   ├── schemas/                   # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── restaurant.py
│   │   ├── category.py
│   │   ├── menu.py
│   │   ├── order.py
│   │   ├── staff.py               # Staff management & PIN switch schemas
│   │   ├── inventory.py           # Inventory, intake, recipe & ledger schemas
│   │   ├── analytics.py           # KPI, revenue, peak hours, funnel, profit schemas
│   │   ├── billing.py             # Manual bill POS & discount approval schemas
│   │   └── common.py              # Shared base schemas
│   ├── routers/                   # FastAPI APIRouter modules
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── admin/                 # Admin & staff routes
│   │   │   ├── __init__.py
│   │   │   ├── restaurants.py
│   │   │   ├── categories.py
│   │   │   ├── menu_items.py
│   │   │   ├── orders.py
│   │   │   ├── variants.py
│   │   │   ├── staff.py           # Staff CRUD & PIN endpoints
│   │   │   ├── inventory.py       # Inventory & recipe management
│   │   │   ├── analytics.py       # Sales analytics & CSV export
│   │   │   └── billing.py         # POS manual billing & discount approvals
│   │   ├── public/                # Public routes (no auth required)
│   │   │   ├── __init__.py
│   │   │   └── menu.py
│   │   └── webhooks/              # Webhook receivers
│   │       ├── __init__.py
│   │       └── razorpay.py
│   ├── services/                  # Business logic layer
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── menu_service.py
│   │   ├── order_service.py
│   │   ├── payment_service.py
│   │   ├── staff_service.py       # Staff RBAC & PIN authentication
│   │   ├── inventory_service.py   # Recipe auto-deduction & stock ledger
│   │   ├── analytics_service.py   # SQL aggregation & reporting engine
│   │   ├── billing_service.py     # Manual POS bills & discount approval workflow
│   │   ├── cache_service.py       # Redis cache-aside + invalidation
│   │   └── websocket_service.py   # WS manager + Redis pub/sub
│   ├── core/                      # Cross-cutting concerns
│   │   ├── __init__.py
│   │   ├── security.py            # JWT encode/decode, argon2id & bcrypt
│   │   ├── redis.py               # Redis connection pool
│   │   └── rate_limit.py          # Rate limiter setup
│   └── utils/                     # Pure utility functions
│       ├── __init__.py
│       └── qr.py                  # QR code generation
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx           # Marketing website route (/)
│   │   │   ├── menu/page.tsx      # Diner ordering route (/menu)
│   │   │   ├── admin/page.tsx     # Operational dashboard route (/admin)
│   │   │   └── superadmin/page.tsx # Chain superadmin console route (/superadmin)
│   │   ├── components/
│   │   ├── context/
│   │   ├── lib/
│   │   │   ├── api.ts             # API base URL resolver
│   │   │   └── pdfGenerator.ts    # Executive A4 & Thermal POS PDF generators
│   │   └── types/
│   │       └── index.ts           # Shared TypeScript interfaces
│   ├── package.json
│   └── README.md
├── alembic/                       # Alembic migrations
│   ├── env.py
│   ├── versions/
│   └── alembic.ini
├── tests/
├── .env.example
├── pyproject.toml
└── README.md
```

---

## Naming Conventions

### Python
| Element             | Convention              | Example                                     |
|---------------------|-------------------------|---------------------------------------------|
| Files / modules     | `snake_case`            | `menu_item.py`, `auth_service.py`           |
| Classes (models)    | `PascalCase`            | `MenuItem`, `OrderItem`, `WebhookEvent`     |
| SQLAlchemy tables   | `snake_case` (plural)   | `__tablename__ = "menu_items"`              |
| Enums               | `PascalCase` + `Enum`   | `OrderStatusEnum`, `RoleEnum`               |
| Enum members        | `UPPER_SNAKE_CASE`      | `PENDING_VERIFICATION`, `RAZORPAY_GATEWAY`  |
| Functions / methods | `snake_case`            | `get_tenant_scoped_query`, `create_order`   |
| Constants           | `UPPER_SNAKE_CASE`      | `ACCESS_TOKEN_EXPIRE_MINUTES`               |
| Pydantic schemas    | `PascalCase` + suffix   | `MenuItemCreate`, `OrderResponse`           |
| FastAPI routers     | `snake_case` file name  | `routers/admin/categories.py`               |
| Route paths         | `kebab-case`            | `/api/admin/menu-items`, `/api/ws-ticket`   |

### Schema suffix conventions
| Suffix     | Use                              |
|------------|----------------------------------|
| `Create`   | Request body for POST            |
| `Update`   | Request body for PATCH/PUT       |
| `Response` | Response body                    |
| `List`     | Paginated list response wrapper  |

### Database
- Table names: plural `snake_case` (`restaurants`, `menu_items`, `order_items`)
- Column names: `snake_case` (`restaurant_id`, `created_at`, `payment_reference`)
- Foreign keys: `{referenced_table_singular}_id` (`restaurant_id`, `category_id`, `order_id`)
- Index names: `ix_{table}_{column}` (`ix_restaurants_slug`)
- Unique constraint names: `uq_{table}_{columns}` (`uq_categories_restaurant_id_name`)

---

## Code Style

### General
- Python 3.11+ — use modern syntax (`match`, `type` aliases, `str | None` unions).
- Line length: 88 characters (Black default).
- Formatter: **Black**.
- Linter: **Ruff** (replaces flake8/isort/pyflakes).
- Type hints on all function signatures. Use `from __future__ import annotations` for forward references.

### FastAPI-specific
- Every request/response body must have a Pydantic model — no raw dicts.
- Admin write endpoints: `model_config = ConfigDict(extra="forbid")` to reject unknown fields.
- Use `Depends()` for all cross-cutting concerns (DB session, auth, tenant scoping).
- Group routes by domain into separate `APIRouter` instances, never dump everything into `main.py`.
- Use `status_code` parameter on route decorators explicitly (`@router.post(..., status_code=201)`).

### Frontend-specific
- Keep route intent strict:
	- `/` for owner-facing marketing only
	- `/menu` for diner ordering flow
	- `/admin` for authenticated operations
- Admin UI actions must call existing backend contracts directly; do not invent parallel client-only state machines.
- Reuse `src/lib/api.ts` for API base resolution so browser-host behavior remains consistent across laptop/mobile testing.
- Preserve visible focus states and reduced-motion behavior across new UI features.

### Error handling
- Use `HTTPException` with appropriate status codes.
- 400: invalid input, state machine violations.
- 401: missing/invalid auth.
- 403: authenticated but wrong role/tenant.
- 404: resource not found (after tenant-scoped query).
- 409: conflict (duplicate entry, idempotency key collision).
- 422: Pydantic validation failure (automatic via FastAPI).
- Never expose stack traces or internal details in error responses.

### Testing
- Framework: **pytest** + **httpx** (`AsyncClient` for async routes).
- Test database: separate PostgreSQL test database, created/torn down per test session.
- Every feature must have tests written alongside it, run before marking done in `progress.md`.
- Use factory fixtures for creating test restaurants, users, menu items, orders.
- Test the "Things That Must Never Happen" explicitly — e.g., verify that cross-tenant access returns 404, that invalid state transitions return 400.

### Git
- Commit messages: `type(scope): description` — e.g., `feat(orders): add state machine enforcement`, `fix(webhook): read raw bytes before verify`.
- One feature per branch, one feature per session.
- Never commit `.env`, secrets, or `__pycache__/`.

---

## Environment Variables

All configuration via env vars. Never hardcode. Template in `.env.example`:

```env
# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/menu_saas
TEST_DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/menu_saas_test

# Redis
REDIS_URL=redis://localhost:6379/0

# Auth
JWT_SECRET_KEY=<generate-a-strong-random-key>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Razorpay
RAZORPAY_KEY_ID=<from-razorpay-dashboard>
RAZORPAY_KEY_SECRET=<from-razorpay-dashboard>
RAZORPAY_WEBHOOK_SECRET=<from-razorpay-dashboard>

# Storage
S3_BUCKET_NAME=menu-saas-assets
S3_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<from-aws>
AWS_SECRET_ACCESS_KEY=<from-aws>

# App
APP_ENV=development
DEBUG=true
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```
