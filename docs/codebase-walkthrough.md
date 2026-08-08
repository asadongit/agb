# Codebase Walkthrough (Fast, Complete)

Goal: understand the full app quickly, with minimum reading.
Time: 45-90 minutes.

## 1) What this app is
- Multi-tenant restaurant management & POS SaaS.
- Backend: FastAPI + PostgreSQL + Redis.
- Frontend: Next.js with four surfaces:
  - `/` marketing website
  - `/menu` diner QR ordering flow
  - `/admin` staff & owner operations dashboard (Live Orders, POS Billing, Inventory, Analytics, Staff)
  - `/superadmin` chain superadmin console

## 2) Read order (follow exactly)
1. `README.md`
2. `docs/architecture.md` (sections 0 to 13)
3. `docs/conventions.md` (especially "Things That Must Never Happen")
4. `docs/decisions.md` (ADR-001 through ADR-024)
5. `docs/progress.md` (what is done)
6. `app/main.py`
7. `app/dependencies.py`
8. `app/models/` (all models)
9. `app/schemas/` (auth, menu, order, staff, inventory, analytics, billing)
10. `app/routers/` (auth, public, admin, webhooks, ws)
11. `app/services/` (auth, menu, order, payment, staff, inventory, analytics, billing)
12. `frontend/src/app/page.tsx`, `frontend/src/app/menu/page.tsx`, `frontend/src/app/admin/page.tsx`, `frontend/src/app/superadmin/page.tsx`
13. `frontend/src/lib/api.ts`, `frontend/src/lib/pdfGenerator.ts`, `frontend/src/types/index.ts`

If short on time, read only: steps 1, 2, 3, 6, 7, 10, 11, 12.

## 3) Mental model in one screen
- Tenant boundary: `restaurant_id` from JWT, never from client input.
- Public flow: diner scans QR -> menu read (Redis cached) -> checkout.
- Payment Modes: RAZORPAY_GATEWAY (online payment via webhooks), PAY_AFTER_MEAL (counter payment), BOTH (diner choice), and Manual POS Settlement (Cash/UPI).
- Staff & RBAC: 6 roles, email/password + 4-digit PIN quick-switch for shared tablets.
- Inventory Engine: ingredients -> intakes -> recipe auto-deduction on order payment & restock on cancellation + `unit_cost_snapshot`.
- Sales Analytics: PostgreSQL SQL aggregations (`date_trunc`, `extract(hour)`) for KPI deltas, peak hours, top items donut chart, order funnel, profit margin, CSV & A4 PDF reports.
- Manual Billing POS: walk-in bill creation -> discount request (auto-approve for Managers/Admins; `PENDING_APPROVAL` with real-time badges for Cashiers) -> Cash/UPI settlement with change calculator -> thermal PDF bill.

## 4) Core folders: what each one owns
- `app/models/`: data structure, SQLAlchemy relations, and enums.
- `app/schemas/`: Pydantic request/response contracts (`extra="forbid"` on admin inputs).
- `app/routers/`: HTTP REST and WebSocket endpoint modules.
- `app/services/`: core domain business logic, calculations, and side-effects.
- `app/core/`: security (argon2id, bcrypt), Redis connection pool, rate limiting.
- `frontend/src/app/`: Next.js App Router page components.
- `frontend/src/lib/`: API client utilities and PDF generators (`pdfGenerator.ts`).

## 5) Understand these 10 flows

### Flow A: App boot
- Start at `app/main.py`.
- See middleware, router inclusions, lifespan events, health route.

### Flow B: Auth + tenant scope
- Read `app/routers/auth.py`.
- Then `app/dependencies.py` for auth dependencies (`get_current_user`, `require_permission`) and tenant scoping helper.

### Flow C: Public menu performance path
- Read `app/routers/public/menu.py`.
- Then `app/services/cache_service.py` and `app/services/menu_service.py`.
- Check cache key strategy (`menu:{slug}`) and invalidation on menu edits.

### Flow D: Orders + state machine
- Read `app/models/enums.py` transitions.
- Then `app/services/order_service.py`.
- Then `app/routers/admin/orders.py` and `app/routers/public/orders.py`.

### Flow E: Payments & Settlements
- `RAZORPAY_GATEWAY`: `app/services/payment_service.py` + `app/routers/webhooks/razorpay.py` (raw-body HMAC verification + `WebhookEvent` idempotency).
- `PAY_AFTER_MEAL`: QR checkout creates order in `PENDING_VERIFICATION`, staff confirms & accepts order (`PREPARING`) and settles payment at counter.
- Manual POS Settlement: Cash/UPI bill settlement via `app/routers/admin/billing.py` & `app/services/billing_service.py`.

### Flow F: Admin operations
- `frontend/src/app/admin/page.tsx` -> map UI tabs to matching backend routers in `app/routers/admin/`.

### Flow G: Staff Authentication & PIN Quick-Switch
- `app/routers/admin/staff.py` & `app/services/staff_service.py`.
- Password auth vs 4-digit PIN authentication (`POST /api/auth/pin-switch`).

### Flow H: Inventory Intakes & Recipe Auto-Deduction
- `app/routers/admin/inventory.py` & `app/services/inventory_service.py`.
- Recipe auto-deduction on `order.paid` / `order.preparing`, restock on `order.cancelled`, capturing `unit_cost_snapshot` on `stock_ledger`.

### Flow I: Sales Analytics Aggregation & PDF Reports
- `app/routers/admin/analytics.py` & `app/services/analytics_service.py`.
- PostgreSQL SQL aggregations for KPI summary deltas, peak hours, top items, conversion funnel, profit margins, CSV export, and `generateAnalyticsPdfReport`.

### Flow J: Manual Billing POS & Discount Approvals
- `app/routers/admin/billing.py` & `app/services/billing_service.py`.
- Walk-in draft bill creation -> discount request (% / flat / complimentary) -> Cashier discount flags `PENDING_APPROVAL` with real-time workspace badge -> Manager approval/rejection -> Cash/UPI settlement -> `generateReceiptPDF`.

## 6) Frontend route map (what to inspect)
- `frontend/src/app/page.tsx`: owner-facing marketing narrative.
- `frontend/src/app/menu/page.tsx`: diner ordering UX + cart + checkout drawer.
- `frontend/src/app/admin/page.tsx`: operational dashboard (Live Orders, POS Billing, Inventory, Analytics, Staff, Settings).
- `frontend/src/app/superadmin/page.tsx`: chain superadmin provisioning console.

## 7) 10 invariants to keep in your head
1. Money uses Decimal/Numeric, never float.
2. No cross-tenant reads/writes (filter by JWT `restaurant_id`).
3. Server computes totals from stored pricing.
4. Order status transitions must strictly follow the state machine graph.
5. Webhook signature must verify raw bytes before JSON parsing.
6. Webhook processing must be idempotent via `WebhookEvent`.
7. Historical COGS profit margin must use `unit_cost_snapshot`, never current live cost.
8. PINs must be hashed with bcrypt, passwords with argon2id.
9. Cashiers cannot self-approve discounts — must route through `BillDiscountApproval`.
10. Secrets only in env vars.

## 8) Quick run/check commands
Backend:
- `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
- `pytest -v`

Frontend:
- `cd frontend`
- `npm run build`

---
This file is intentionally compact. Use it as the primary navigation map, then deep-read only where needed.
