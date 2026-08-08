# Build Progress

> Updated at the end of every coding session. Items are checked off only after tests pass and the feature is verified.

---

## Build Order Checklist

### Phase 1: Project Scaffold + Database Models
- [x] Initialize project structure (folders, `pyproject.toml` / `requirements.txt`, `.gitignore`, `.env.example`)
- [x] Configure `app/config.py` (Pydantic Settings, env var loading)
- [x] Set up `app/database.py` (SQLAlchemy async engine, sessionmaker, Base)
- [x] Create all SQLAlchemy models (`Restaurant`, `User`, `Category`, `MenuItem`, `MenuItemVariant`, `Order`, `OrderItem`, `WebhookEvent`)
- [x] Create all enums (`RoleEnum`, `PaymentModeEnum`, `OrderStatusEnum`)
- [x] Initialize Alembic and generate initial migration setup (`alembic/env.py`, `alembic.ini`)
- [x] Verify models and relationships against schema requirements
- [x] Write model-level tests (enum validation, constraints, relationships)

### Phase 2: Authentication
- [x] Implement password hashing (argon2id via `argon2-cffi`)
- [x] Implement JWT access token creation and verification
- [x] Implement refresh token flow (rotation, hashed storage, revocation)
- [x] Create auth routes (`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`)
- [x] Create `get_current_user` dependency (decode JWT, load user)
- [x] Create role-based dependencies (`require_admin`, `require_staff_or_admin`)
- [x] Write auth tests (login, token refresh, role enforcement, expired token rejection)

### Phase 3: Tenant-Scoped CRUD
- [x] Implement `tenant_scoped_query` shared dependency/helper
- [x] Restaurant CRUD (superadmin only for create; admin for read/update own)
- [x] Category CRUD (admin: create, read, update, delete within own restaurant)
- [x] MenuItem CRUD (admin: full CRUD, including `is_available` toggle)
- [x] MenuItemVariant CRUD (admin: full CRUD under a menu item)
- [x] Verify tenant isolation: cross-tenant access returns 404, not 403
- [x] Write CRUD tests (happy path + tenant isolation + unique constraint enforcement)

### Phase 4: Public Menu + Redis Caching
- [x] Set up Redis connection pool (`app/core/redis.py`)
- [x] Implement `GET /api/public/menu/{restaurant_slug}` (no auth required)
- [x] Implement cache-aside pattern (check Redis → query Postgres → cache with jittered TTL)
- [x] Implement thundering-herd lock (`SET menu_lock:{slug} NX EX 5`)
- [x] Implement cache invalidation on Category/MenuItem/Variant create/update/delete
- [x] Write caching tests (cache hit, cache miss, invalidation, lock behavior)

### Phase 5: Orders + State Machine
- [x] Implement order creation endpoint (`POST /api/orders/checkout`)
- [x] Implement server-side total computation from stored prices
- [x] Implement OrderItem snapshot pricing (`unit_price` captured at order time)
- [x] Implement order status state machine (valid transitions map, reject invalid with 400)
- [x] Implement order status update endpoint (admin/staff)
- [x] Write order tests (creation, pricing, state transitions — valid and invalid)

### Phase 6: Razorpay Integration (Mode A)
- [x] Implement Razorpay order creation with Route transfers
- [x] Generate checkout config (UPI-only display blocks)
- [x] Implement webhook handler (`POST /api/webhooks/razorpay`)
- [x] Implement raw-body signature verification (read bytes before JSON parse)
- [x] Implement idempotency check (WebhookEvent table lookup by `event_id`)
- [x] On `order.paid`: validate state machine predecessor, update status, broadcast
- [x] Write webhook tests (valid signature, invalid signature, duplicate event, state machine enforcement)

### Phase 7: Direct UPI Deep Link (Mode B)
- [x] Implement UPI deep link generation (`upi://pay?pa=...&am=...&tr=...`)
- [x] Implement "I have paid" claim endpoint (`POST /api/orders/{id}/claim-paid`)
- [x] Implement rate limiting on claim endpoint (prevent spam)
- [x] Implement staff confirmation endpoint (`POST /api/admin/orders/{id}/confirm-payment`)
- [x] Broadcast `VERIFICATION_NEEDED` and `ORDER_STATUS_CHANGED` events
- [x] Write Mode B tests (deep link format, claim rate limit, confirmation flow)

### Phase 8: WebSocket Kitchen Dashboard
- [x] Implement `POST /api/ws-ticket` (issue short-lived, single-use ticket)
- [x] Implement WebSocket endpoint (`ws://.../ws/kitchen/{restaurant_id}`)
- [x] Implement ticket validation + restaurant_id ownership check on connect
- [x] Implement Redis pub/sub subscriber per connection (fan-out across instances)
- [x] Broadcast `NEW_ORDER_PAID`, `VERIFICATION_NEEDED`, `ORDER_STATUS_CHANGED`
- [x] Write WebSocket tests (ticket auth, invalid ticket, event delivery)

### Phase 9: Refunds & Cancellations
- [x] Implement cancel endpoint (`POST /api/admin/orders/{id}/cancel`) — only from `PENDING` / `PENDING_VERIFICATION`
- [x] Implement refund endpoint (`POST /api/admin/orders/{id}/refund`) — only from `PAID`
- [x] Mode A refund: call Razorpay refund API, store refund ID
- [x] Mode B refund: administrative record only (no automated money movement)
- [x] Write refund/cancel tests (valid transitions, invalid transitions, Razorpay API mock)

### Phase 10: Security & Ops Hardening
- [x] Add rate limiting to public menu endpoint
- [x] Add rate limiting to webhook endpoint
- [x] Add rate limiting to "I have paid" trigger
- [x] Implement audit logging (who changed what — menu edits, order status overrides)
- [x] Review all routes for proper input validation (`extra="forbid"` on admin writes)
- [x] Review all error responses for information leakage
- [x] Verify no secrets in source code, logs, or error responses
- [x] Final pass: run full test suite (41 passed, 1 skipped)

### Phase 11: Multi-Tenant Superadmin & Staff Management
- [x] Create Superadmin console (`/superadmin` & `/admin/superadmin`) with platform credentials and outlet provisioning
- [x] Expand `RoleEnum` to 6 granular roles (`SUPERADMIN`, `RESTAURANT_ADMIN`, `MANAGER`, `KITCHEN_STAFF`, `CASHIER`, `WAITER`)
- [x] Implement staff CRUD endpoints (`/api/admin/staff`) with role permission gating
- [x] Implement 4-digit PIN quick-switch authentication (`POST /api/auth/pin-switch`) with bcrypt hashing
- [x] Implement staff audit logging (`staff_audit_logs`)

### Phase 12: Per-Outlet Inventory & Recipe Management
- [x] Implement ingredient master (`inventory_items`) with units (`kg`, `g`, `l`, `ml`, `pcs`), reorder thresholds, and unit costs
- [x] Implement stock intakes and restocking history (`stock_intakes`)
- [x] Implement recipe mapping (`menu_item_recipes`) connecting menu items/variants to ingredient quantities
- [x] Implement stock auto-deduction on order payment/preparation and auto-restock on cancellation
- [x] Implement `stock_ledger` audit trail with immutable `unit_cost_snapshot` capture

### Phase 13: Sales & Analytics Feature
- [x] Implement SQL aggregated KPI summary strip (Revenue, Orders, AOV, Profit Margin %) with period-over-period delta badges
- [x] Implement time-bucketed revenue trend endpoint (hourly, daily, weekly, monthly) with previous period comparison overlay
- [x] Implement 24-hour service volume peak hours heatmap (0-23h)
- [x] Implement top dishes analysis with ranked list and revenue-share donut/pie chart
- [x] Implement order conversion funnel and net profit margin analysis (Revenue - COGS using cost snapshots)
- [x] Implement CSV data export and A4 executive PDF report generation (`generateAnalyticsPdfReport`)

### Phase 14: Billing & POS System
- [x] Extend `Order` and `OrderItem` schemas for POS manual bills (`source="manual"`, subtotal, discount, payment method)
- [x] Implement manual bill POS draft creation with item catalog picker, variant selector, quantity controls, and zero-cost complimentary toggles
- [x] Implement discount engine (% / flat / complimentary) with mandatory reason notes
- [x] Implement two-tier discount approval workflow: Manager/Admin auto-approve; Cashier-created discounts flag as `PENDING_APPROVAL` with real-time workspace notification badges
- [x] Implement Cash & Direct UPI payment settlement with live Cash Change Calculator
- [x] Implement monospaced thermal PDF receipt generation and reprinting (`generateReceiptPDF`)

### Phase 15: UI Contextual Cleanup & Theme Consistency
- [x] Clean up red contextual error/notice banners on active tab switches with dismiss buttons
- [x] Add theme mode toggle button to Superadmin Console pre-auth/post-auth header and refine Admin sidebar footer
- [x] Verify production build (`npm run build` compiles with 0 errors)

---

## Session Log

### Session 1 — 2026-08-04
**Focus:** Complete end-to-end implementation of multi-tenant B2B menu & ordering SaaS backend across all 10 phases.
**Completed:**
- Set up documentation system (`architecture.md`, `conventions.md`, `decisions.md`, `progress.md`).
- Phase 1: Project scaffold, config, database, models (`Restaurant`, `User`, `Category`, `MenuItem`, `MenuItemVariant`, `Order`, `OrderItem`, `WebhookEvent`, `AuditLog`), enums & state machine map, Alembic config.
- Phase 2: Auth system (argon2id hashing, JWT access + refresh rotation, role dependencies).
- Phase 3: Tenant-scoped admin CRUD for Restaurants, Categories, MenuItems, and Variants with audit logging.
- Phase 4: Public menu endpoint with Redis cache-aside, thundering-herd locking (`SET NX EX`), and synchronous cache invalidation on edits.
- Phase 5: Server-side price computation for orders, OrderItem snapshot pricing, order status state machine enforcement.
- Phase 6: Mode A Razorpay integration with Route transfer split, raw-body HMAC verification, and `WebhookEvent` idempotency table.
- Phase 7: Mode B Direct UPI deep link generation, rate-limited "I have paid" claim trigger, and staff manual confirmation flow.
- Phase 8: WebSocket ticket issuance endpoint (`POST /api/ws-ticket`) and kitchen dashboard connection manager backed by Redis pub/sub for multi-instance fan-out.
- Phase 9: Cancellation and refund endpoints with state machine predecessor checks.
- Phase 10: Rate limiting (slowapi), audit logging service, Pydantic `extra="forbid"` on admin inputs.
- Test suite: 42 tests written across `test_auth.py`, `test_menu.py`, `test_orders.py`, `test_state_machine.py`, `test_webhooks.py`, `test_websocket.py`. Full test suite run passed (41 passed, 1 skipped).
**Notes:** All 9 "Things That Must Never Happen" rules strictly enforced and verified.

### Session 2 — 2026-08-05
**Focus:** Deliver owner-facing frontend surfaces and operations dashboard mapped to backend architecture.
**Completed:**
- Replaced default homepage with a marketing website targeted at restaurant chain decision-makers.
- Moved diner QR menu experience to a dedicated route (`/menu`).
- Implemented owner/admin dashboard route (`/admin`) with API-backed operations:
	- Order board actions (status move, confirm payment, cancel, refund)
	- Category CRUD
	- Menu item CRUD + availability toggles
	- Variant CRUD + availability toggles
	- Restaurant settings read/update
- Updated frontend typography/theme tokens and responsive layout behavior for new surfaces.
- Route-level lint verification passed for updated frontend pages.
**Notes:** Superadmin-only restaurant creation remains intentionally outside owner dashboard scope.

### Session 3 — 2026-08-06
**Focus:** Staff Management & PIN Quick-Switch System.
**Completed:**
- Created `StaffAuditLog` model and migration script `f4404fd621g0`.
- Expanded `RoleEnum` to 6 roles (`SUPERADMIN`, `RESTAURANT_ADMIN`, `MANAGER`, `KITCHEN_STAFF`, `CASHIER`, `WAITER`).
- Built backend `app/routers/admin/staff.py` and `app/services/staff_service.py` for staff CRUD, permission lookup, audit logs, and 4-digit PIN authentication (`POST /api/auth/pin-switch`).
- Built frontend Staff & Team workspace tab with PIN quick-switch lock-screen modal.

### Session 4 — 2026-08-07
**Focus:** Per-Outlet Inventory & Recipe Management System.
**Completed:**
- Created models `InventoryItem`, `StockIntake`, `MenuItemRecipe`, and `StockLedger` with Alembic migration `f3303fd510f0` and `f5505fe732h0` (`unit_cost_snapshot`).
- Implemented recipe auto-deduction on order payment/preparation and auto-restock on cancellation.
- Built frontend Inventory tab for ingredient master management, stock intakes, recipe mapping, low-stock warnings, and stock ledger audit logs.

### Session 5 — 2026-08-07
**Focus:** Sales & Analytics Feature & Executive PDF Reports.
**Completed:**
- Built backend `app/routers/admin/analytics.py` and `app/services/analytics_service.py` featuring optimized PostgreSQL SQL aggregations (`date_trunc`, `extract(hour)`).
- Implemented KPI summary strip with period-over-period comparison badges, time-bucketed revenue trends, peak hours service heatmap, top dishes donut chart, order funnel, profit margin tracking (Revenue - COGS using `unit_cost_snapshot`), CSV export, and A4 executive PDF report generator (`generateAnalyticsPdfReport`).
- Built frontend Sales & Analytics tab with skeleton loaders and date range presets.

### Session 6 — 2026-08-08
**Focus:** Billing & POS System (Admin Dashboard).
**Completed:**
- Extended `Order` and `OrderItem` models with Alembic migration `f6606fe843i0` adding `source` (`"qr"` vs `"manual"`), subtotal, discount fields, and payment method.
- Built backend `app/routers/admin/billing.py` and `app/services/billing_service.py` for POS draft bill creation, discount application, approval workflows, and Cash/UPI payment settlement.
- Built frontend Billing & POS workspace tab with manual bill drawer, item catalog picker, discount modal (% / flat / complimentary with mandatory reason notes), two-tier discount approval queue with workspace notification badges, Cash & UPI payment modal with live change calculator, and thermal PDF receipt generator (`generateReceiptPDF`).
- Updated system documentation (`README.md`, `architecture.md`, `codebase-walkthrough.md`, `conventions.md`, `decisions.md`, `progress.md`).
- Verified production build (`npm run build` compiled with 0 errors).

### Session 7 — 2026-08-08
**Focus:** ApnaGreen Basket Rebrand, Domain Terminology Remap & Product Catalog with Dual Pricing.
**Completed:**
- **Full rebrand** from "RushTable SaaS" → "ApnaGreen Basket" across all frontend pages, components, metadata, and backend API metadata.
- **Domain terminology remap** across entire codebase:
  - "Table #" → "Basket #" (all customer-facing and admin UI)
  - "Menu & Catalog" → "Product Catalog" (admin sidebar and management UI)
  - "Menu Items" → "Products" (all UI labels)
  - "Kitchen Staff" → "Floor Staff" (role enum, permissions, UI dropdowns)
  - "Kitchen Columns" → "Basket Columns" (order board)
  - "Diner" → "Customer" (all UI copy)
  - "Pay After Meal" → "Pay At Counter" (payment mode enum and all labels)
- **Backend enum changes** with Alembic migration readiness:
  - `KITCHEN_STAFF` → `FLOOR_STAFF` in `RoleEnum`
  - `PAY_AFTER_MEAL` → `PAY_AT_COUNTER` in `PaymentModeEnum`
  - Added `PricingModeEnum` (`WEIGHT_BASED`, `FIXED_UNIT`)
- **Dual pricing model** for product catalog:
  - Added `pricing_mode` and `unit_label` fields to `MenuItem` model
  - Changed `OrderItem.quantity` from `Integer` to `Numeric(10,3)` for weight-based entries
  - Updated all Pydantic schemas (`MenuItemCreate`, `MenuItemUpdate`, `MenuItemResponse`, `PublicMenuItem`, `OrderItemRequest`, `BillItemInput`, `BillItemResponse`)
  - Added pricing mode selector and unit label input to admin product create/edit form
- **Marketing page** rewritten for fruit/veg/drinks mart context with Jammu outlet data.
- **Centralized brand configuration** in `frontend/src/lib/brand.ts` with swappable tokens.
- Superadmin default email → `superadmin@apnagreenbasket.com`.

### Session 8 — 2026-08-08
**Focus:** Part 2: Basket QR & Customer Session System.
**Completed:**
- **Per-outlet session duration setting**: Added `session_duration_minutes` (default 30 mins, min 5, max 120) to `Restaurant` model, Pydantic schemas, and Outlet Settings admin UI.
- **Enhanced session lifecycle model**: Created `SessionStatusEnum` (`ACTIVE`, `COMPLETED`, `EXPIRED`, `TERMINATED`) and updated `TableSession` with `status`, `terminated_by_id`, and `terminated_reason`.
- **Basket locking enforcement**: Re-scans with exact same name resume active session; different name scanning an active basket is blocked with `409 Conflict` ("This basket is currently in use by {name}").
- **AbandonedCart persistence model**: Created `AbandonedCart` model capturing JSON snapshots of cart items (`menu_item_id`, `variant_id`, `name`, `quantity`, `unit_price`, `pricing_mode`, `unit_label`), estimated total, and `ABANDONED` / `CONVERTED` status.
- **Public customer endpoints**: Added `POST /api/sessions/{id}/extend` for session extension and `POST /api/sessions/{id}/abandon-cart` for fire-and-forget push of local cart on session expiry.
- **Admin session routes**: Created `app/routers/admin/sessions.py` with `GET /api/admin/sessions` (list active), `GET /api/admin/sessions/abandoned-carts` (list abandoned), `GET /api/admin/sessions/abandoned-carts/count` (badge count), `POST /api/admin/sessions/{id}/terminate` (Manager+ termination), and `POST /api/admin/abandoned-carts/{id}/convert` (handoff to POS manual billing).
- **Frontend session expiry warning**: Rewrote `SessionContext.tsx` with live countdown timer, 2-minute warning flag (`isExpiryWarning`), `extendSession()`, and `abandonCart()`. Built `SessionExpiryWarning.tsx` floating modal component.
- **Admin Baskets & Abandoned Carts workspace**: Added sidebar count badge and slide-out overlay panel showing active basket sessions with time remaining and termination controls, plus abandoned carts with item breakdown and one-click "Convert to Bill".
### Session 9 — 2026-08-08
**Focus:** Part 3: Confirmation / Verification Pipeline.
**Completed:**
- **Verification Rules Engine**: Extended `Restaurant` model and schemas with `verification_amount_cutoff: Decimal | None` (₹ threshold) and `flagged_item_ids: list[str]` (product IDs requiring mandatory check).
- **Rule Precedence Logic**: Implemented `evaluate_verification_rules()` in `order_service.py` enforcing strict precedence: flagged product in cart ALWAYS overrides amount cutoff; orders under amount cutoff auto-skip verification (`is_auto_verified = True`); default (no rules set) requires manual staff verification for all orders.
- **Order Audit Marker (`is_auto_verified`)**: Added `is_auto_verified: bool` column on `Order` model and schema to maintain audit trail of auto-confirmed vs staff-verified completions without altering column structure.
- **State Machine Adaptations**: Updated `VALID_ORDER_TRANSITIONS` allowing direct `PENDING_VERIFICATION → COMPLETED` and `PAID → COMPLETED` transitions for pure pick-and-go basket flows (bypassing food prep `PREPARING`).
- **Admin "Basket Columns" Board**: Adjusted Kanban column layout to pure pick-and-go pipeline (`Confirmation Pending`, `Payment Pending / Paid`, `Completed`, `Cancelled`).
- **Yellow Dot Audit Marker**: Rendered a small yellow dot badge (`bg-amber-400 rounded-full h-2.5 w-2.5`) on order cards in `Completed` view with tooltip `"Auto-verified by rule (skipped manual check)"` for `is_auto_verified == true`.
- **Outlet Settings UI**: Added **Basket Verification Rules (Manager+)** configuration card in Outlet Settings tab for configuring amount cutoff threshold and checking flagged products from catalog.
### Session 10 — 2026-08-08
**Focus:** Part 4: Inventory Expiry & Batch Tracking (Final Part of 4-Part Build).
**Completed:**
- **Batch-Level Expiry Tracking Data Model**: Extended `StockIntake` model in `app/models/stock_intake.py` and Pydantic schemas in `app/schemas/inventory.py` with `expiry_date: datetime | None` and `remaining_quantity: Decimal` per batch.
- **FIFO Auto-Deduction Engine by Expiry Date**: Updated `process_order_auto_deduction()` in `inventory_service.py` to draw down stock at the batch level ordered by earliest expiry date first (`FIFO by expiry_date`), reducing `remaining_quantity` batch by batch while preserving aggregate `InventoryItem.current_stock`.
- **Near-Expiry Alert Service**: Implemented `get_near_expiry_alerts()` service function and `GET /api/admin/inventory/near-expiry-alerts` endpoint returning active batches expiring within threshold days or already expired.
- **Admin Inventory UI Extensions**:
  - Added optional **Expiry Date** date picker to Stock Intake entry form.
  - Rendered **Near-Expiry & Expired Produce Batches** alert banner section in Inventory Overview alongside low-stock alerts, displaying batch item name, remaining stock, expiry date, and status pill (`EXPIRING SOON - In 3d` or `EXPIRED`).
  - Added near-expiry stat card to inventory summary metrics.
- **Full System Consistency Audit & Final Build Verification**:
  - Confirmed end-to-end integration across all 4 parts: Product Catalog dual pricing (Part 1), Basket Sessions & abandoned cart billing (Part 2), Verification Pipeline & flagged product rules (Part 3), and Inventory Expiry FIFO tracking (Part 4).
  - Verified Next.js frontend (`npm run build` — 0 TypeScript/JSX errors).
  - Verified Pytest backend test suite (`uv run pytest` — 54 passed, 1 skipped).



