# Architectural Decision Records (ADR Log)

> Running log of non-obvious architectural and scope decisions. Pre-populated with decisions already baked into the spec. New entries are added at the bottom with a date, whenever a meaningful design choice is made during development.

---

## Decisions from Initial Specification

### ADR-001: Shared-database multi-tenancy
**Decision:** Single PostgreSQL database, tenant isolation via `restaurant_id` foreign key on all tenant-scoped tables.
**Rationale:** Simplifies ops (one DB to manage, one migration to run), sufficient isolation for the B2B use case. Enforced by a shared `get_tenant_scoped_query` helper that appends the JWT-derived `restaurant_id` filter to every query.

### ADR-002: Server-side total computation
**Decision:** Order totals are always computed server-side from stored `MenuItem` / `MenuItemVariant` prices. Client-submitted totals are never trusted.
**Rationale:** Prevents price tampering. The client is an untrusted environment — a malicious user could modify the total before submission.

### ADR-003: Multi-option payment mode design (Razorpay Gateway + Pay At Counter + POS Settlement)
**Decision:** Outlets configure payment modes via `payment_mode` (`RAZORPAY_GATEWAY`, `PAY_AT_COUNTER`, `BOTH`).
**Rationale:** `RAZORPAY_GATEWAY` provides automated webhook payment confirmation for online customers. `PAY_AT_COUNTER` enables counter-billing ordering where staff confirm and collect payment. `BOTH` allows customers to choose their preferred option during QR checkout. For walk-in POS billing, staff settle orders directly via `CASH` or `UPI`.

### ADR-004: Redis for cache + distributed lock + pub/sub
**Decision:** Redis serves three distinct roles — menu cache (cache-aside with jittered TTL), distributed lock (thundering-herd protection on cache miss), and pub/sub (WebSocket event fan-out across app instances).
**Rationale:** One Redis instance handles all three concerns. Simpler infrastructure than adding separate tools for each role. Redis pub/sub is lightweight and sufficient for real-time kitchen events (not high-throughput streaming).

### ADR-005: Ticket-based WebSocket authentication
**Decision:** WebSocket connections authenticate via a short-lived, single-use ticket obtained from `POST /api/ws-ticket` (authenticated REST call), not by passing the JWT as a query parameter.
**Rationale:** JWTs in query strings get logged by proxies, load balancers, and browser history. The ticket flow limits exposure: tickets are opaque, single-use, and expire in 30–60 seconds.

### ADR-006: Order status state machine with server-side enforcement
**Decision:** Valid order status transitions are defined in a strict state machine graph. The server rejects any transition not on the graph with HTTP 400.
**Rationale:** Prevents impossible states (e.g., `COMPLETED → PENDING`) that would corrupt business logic, payment tracking, and kitchen workflows.

### ADR-007: Webhook idempotency via WebhookEvent table
**Decision:** Every incoming Razorpay webhook is deduplicated using a `WebhookEvent` table keyed by Razorpay's `event_id`. If the event already exists, return 200 OK and skip processing.
**Rationale:** Razorpay retries webhooks on non-200 responses and on timeouts. Without idempotency, duplicate payments could be recorded or orders processed twice.

### ADR-008: Raw-body signature verification for Razorpay webhooks
**Decision:** The webhook handler reads the raw request body as bytes and verifies the `X-Razorpay-Signature` HMAC against those bytes *before* any JSON parsing.
**Rationale:** Parsing to JSON and re-serializing changes byte ordering, whitespace, and key order, which produces HMAC mismatches. The signature must be verified against the exact bytes Razorpay sent.

### ADR-009: argon2id for password hashing
**Decision:** Use argon2id (via `argon2-cffi`) as the primary password hashing algorithm, with bcrypt as an acceptable fallback.
**Rationale:** argon2id is the winner of the Password Hashing Competition, provides memory-hard resistance to GPU/ASIC attacks, and is the current OWASP recommendation.

### ADR-010: Short-lived JWT + refresh token with rotation
**Decision:** Access tokens expire in ~15 minutes. Refresh tokens are longer-lived, stored hashed in the DB, rotated on each use, and revocable per-user.
**Rationale:** Short access tokens limit damage from token theft. Refresh token rotation detects reuse (if an old refresh token is presented, revoke all tokens for that user).

### ADR-011: Pydantic `extra="forbid"` on admin write schemas
**Decision:** All Pydantic models for admin create/update endpoints use `model_config = ConfigDict(extra="forbid")` to reject unknown fields.
**Rationale:** Prevents accidental mass-assignment vulnerabilities where a client could inject fields like `restaurant_id` or `role` into an update payload.

### ADR-012: Cache-aside with jittered TTL + lock-based thundering-herd protection
**Decision:** Public menu responses are cached in Redis with a 24h TTL + ±10% random jitter. On cache miss, a Redis lock (`SET NX EX 5`) is acquired before querying Postgres; concurrent misses wait and retry the cache.
**Rationale:** Jitter prevents synchronized mass expiry across tenants. The lock prevents N concurrent requests from all hitting Postgres simultaneously on a cold cache.

### ADR-013: OrderItem.unit_price as snapshot
**Decision:** `OrderItem.unit_price` is a snapshot of the price at order time, stored alongside the order. It is never recomputed from the live `MenuItem` price.
**Rationale:** Menu prices change over time. Historical order records must reflect the price the customer actually paid, not the current menu price.

---

## Development Decisions

<!-- 
Template for new entries:

### ADR-NNN: [Title] — YYYY-MM-DD
**Decision:** What we decided.
**Rationale:** Why, and what alternatives were considered.
**Alternatives rejected:** (optional) What we didn't do and why.
-->

### ADR-014: Unique JTI claim in access tokens — 2026-08-04
**Decision:** Include a random `jti` (JWT ID) in short-lived access tokens via `secrets.token_urlsafe(16)`.
**Rationale:** Prevents identical token strings being generated for consecutive requests within the same second, and enables future token revocation/blacklisting if needed.

### ADR-015: Centralized AuditLog service — 2026-08-04
**Decision:** Create a dedicated `log_action` helper in `app/services/audit_service.py` called across all admin CRUD and order status mutation routes.
**Rationale:** Ensures a complete audit trail of who modified which entity and when, without duplicating log construction logic across routers.

### ADR-016: SQLAlchemy JSON type for cross-dialect compatibility — 2026-08-04
**Decision:** Use `sqlalchemy.JSON` instead of dialect-specific `JSONB` for `WebhookEvent.payload` and `AuditLog.details`.
**Rationale:** `sqlalchemy.JSON` compiles to native `jsonb` in PostgreSQL while allowing SQLite in-memory test databases to run without dialect compilation errors.

### ADR-017: Frontend route split by audience — 2026-08-05
**Decision:** Separate frontend route ownership by audience: marketing at `/`, diner ordering at `/menu`, and owner/admin operations at `/admin`.
**Rationale:** Prevents mixed-context UI complexity and keeps each route optimized for one job, while preserving a single deployable frontend app.

### ADR-018: Admin dashboard uses existing backend contracts directly — 2026-08-05
**Decision:** Implement admin dashboard actions as direct calls to existing FastAPI admin routes (orders, categories, menu items, variants, restaurant settings), instead of introducing a frontend-only abstraction layer first.
**Rationale:** Keeps behavior aligned with tenant-scoped backend rules and state machine enforcement, reduces drift between UI and API semantics, and accelerates operational feature delivery.

### ADR-019: Granular 6-role RBAC & bcrypt 4-digit PIN quick-switch — 2026-08-06
**Decision:** Expand `RoleEnum` to 6 roles (`SUPERADMIN`, `RESTAURANT_ADMIN`, `MANAGER`, `KITCHEN_STAFF`, `CASHIER`, `WAITER`). Support email/password sign-in alongside 4-digit PIN quick-switch authentication (`POST /api/auth/pin-switch`), with PINs hashed using bcrypt.
**Rationale:** Shared kitchen and POS counter tablets require instant staff switching without requiring full credential re-entry, while ensuring strict permission gating and audit logging.

### ADR-020: Per-outlet inventory recipe auto-deduction & cancellation restock — 2026-08-07
**Decision:** Implement per-outlet inventory management with ingredient recipe mapping (`MenuItemRecipe`). Automatically deduct stock when orders transition to `PAID` or `PREPARING`, and automatically restock ingredients if an order is `CANCELLED`.
**Rationale:** Automates real-time ingredient tracking and prevents inventory discrepancies without manual staff effort.

### ADR-021: Immutable `unit_cost_snapshot` capture on stock ledger — 2026-08-07
**Decision:** Record `unit_cost_snapshot` (Numeric 10,2) on `StockLedger` entries whenever ingredients are deducted for an order.
**Rationale:** Ingredient purchasing costs change over time. Historical COGS and profit margin reporting must evaluate costs against the exact ingredient snapshot at the moment of consumption, not current live catalog prices.

### ADR-022: Server-side PostgreSQL SQL aggregations for Sales & Analytics — 2026-08-07
**Decision:** Perform all analytics computations (KPI summary deltas, hourly revenue buckets, peak service hours heatmaps, top dish revenue shares, order conversion funnels, profit margins) via optimized PostgreSQL SQL queries (`date_trunc`, `extract(hour)`).
**Rationale:** Offloads heavy mathematical calculations to PostgreSQL, ensuring sub-second response times for analytics dashboards and PDF/CSV reports.

### ADR-023: Schema extension of `Order`/`OrderItem` for POS manual billing — 2026-08-08
**Decision:** Extend the existing `Order` and `OrderItem` models with `source` (`"qr"` vs `"manual"`), discount fields, and payment method details (`CASH` / `UPI`), rather than creating a parallel `bills` table.
**Rationale:** Ensures walk-in and phone bills seamlessly share the same state machine, live kitchen feed, inventory auto-deduction, sales analytics, and thermal receipt rendering pipelines.

### ADR-024: Two-tier discount approval workflow with real-time notification badges — 2026-08-08
**Decision:** Discounts created by non-Manager/Admin staff (`CASHIER`, `WAITER`) default to `discount_status = "PENDING_APPROVAL"`, creating a `BillDiscountApproval` request and displaying real-time notification badges across the admin workspace for Manager review. Discounts applied by Managers/Admins are auto-approved.
**Rationale:** Eliminates unauthorized cashier discounts while enabling frictionless manager overrides and preventing counter bottlenecks.

### ADR-025: Domain rebrand from restaurant SaaS to multi-outlet mart platform — 2026-08-08
**Decision:** Rebrand the entire platform from "RushTable SaaS" (restaurant QR ordering) to "ApnaGreen Basket" (multi-outlet fruits/vegetables/drinks mart in Jammu). All user-facing strings, metadata, marketing copy, and documentation updated. Backend API field names (`table_number`, `restaurant_id`) kept as-is to avoid risky DB schema renames.
**Rationale:** The business is a hybrid self-checkout mart, not a restaurant chain. Backend field names are purely internal and renaming them would require cascading Alembic migrations across 15+ models/services with no user-facing benefit.

### ADR-026: Dual pricing model (weight-based vs fixed-unit) for product catalog — 2026-08-08
**Decision:** Added `PricingModeEnum` (`WEIGHT_BASED`, `FIXED_UNIT`) and `unit_label` fields to `MenuItem`. Changed `OrderItem.quantity` from `Integer` to `Numeric(10,3)` to support weight entries (e.g., 1.250 kg). Variants are kept as-is for fixed-unit products (e.g., 500ml vs 1L).
**Rationale:** A mart sells both loose produce (priced per kg — variable weight) and packaged goods (priced per piece/pack — fixed count). The pricing mode flag lets admin staff choose per-product, and the decimal quantity column accommodates weight entries without breaking integer-quantity fixed-unit products.

### ADR-027: `KITCHEN_STAFF` → `FLOOR_STAFF` and `PAY_AFTER_MEAL` → `PAY_AT_COUNTER` enum renames — 2026-08-08
**Decision:** Renamed role enum value `KITCHEN_STAFF` to `FLOOR_STAFF` and payment mode enum value `PAY_AFTER_MEAL` to `PAY_AT_COUNTER`. These are DB-stored enum values requiring Alembic migration.
**Rationale:** A mart has no kitchen — staff on the floor verify baskets and assist customers. "Pay After Meal" is nonsensical for a mart — "Pay At Counter" accurately describes the workflow.
