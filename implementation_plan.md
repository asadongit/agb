# Part 2: Basket QR & Customer Session System — Final Plan

## Goal

Convert the existing table session system into a basket-locking self-checkout session system with configurable duration, session extension, abandoned carts, and manual staff termination.

---

## Key Design Decision: Abandoned Cart Capture

**No server-side cart sync.** The customer's shopping cart stays entirely in the browser (localStorage via `CartContext`). Zero extra API calls during shopping.

**On session expiry / termination:** The frontend does a **single final push** of whatever is in the local cart at that moment — formatted as an abandoned cart record — to a new `POST /api/sessions/{id}/abandon-cart` endpoint. This is a one-shot fire-and-forget push. The backend stores it as an `AbandonedCart` record with a JSON snapshot of items. It then appears under the **draft cart icon** on the admin dashboard.

**Flow:**
1. Session expiry timer fires in the frontend (~2 min warning, then actual expiry)
2. On expiry/decline-to-extend: frontend serializes local cart → `POST /api/sessions/{id}/abandon-cart`
3. Backend stores the snapshot, marks session EXPIRED, releases basket lock
4. Admin dashboard shows the abandoned cart under a distinct icon/badge
5. Staff can open it and "Convert to Bill" (pre-fills manual bill from snapshot)

---

## Proposed Changes

### Component 1: Restaurant Model — Session Duration Setting

#### [MODIFY] [restaurant.py](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/app/models/restaurant.py)
- Add `session_duration_minutes: Integer, default=30, nullable=False`

#### [MODIFY] [restaurant.py](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/app/schemas/restaurant.py)
- Add `session_duration_minutes` to `RestaurantCreate`, `RestaurantUpdate`, `RestaurantResponse`
- Constrain: `Field(default=30, ge=5, le=120)`

---

### Component 2: Session Enums & Model Enhancement

#### [MODIFY] [enums.py](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/app/models/enums.py)
- Add `SessionStatusEnum`: `ACTIVE`, `COMPLETED`, `EXPIRED`, `TERMINATED`

#### [MODIFY] [table_session.py](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/app/models/table_session.py)
- Replace `is_active: Boolean` → `status: SessionStatusEnum` (default `ACTIVE`)
- Add hybrid property `is_active` → `return self.status == SessionStatusEnum.ACTIVE` for backward compat
- Add `terminated_by_id: UUID FK → users.id` (nullable)
- Add `terminated_reason: String(500)` (nullable)

---

### Component 3: AbandonedCart Model

#### [NEW] [abandoned_cart.py](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/app/models/abandoned_cart.py)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `restaurant_id` | UUID FK → restaurants | |
| `session_id` | UUID FK → table_sessions | |
| `table_number` | String(50) | Basket # at abandonment |
| `customer_name` | String(255) | |
| `customer_phone` | String(20) | nullable |
| `items` | JSON | `[{menu_item_id, variant_id, name, quantity, unit_price, pricing_mode, unit_label}]` |
| `total_estimate` | Numeric(10,2) | Estimated total |
| `status` | String(30) | `ABANDONED` / `CONVERTED` |
| `converted_order_id` | UUID FK → orders | nullable, filled on bill conversion |
| `created_at, updated_at` | TimestampMixin | |

Items stored as JSON snapshot — includes everything needed to pre-fill `CreateManualBillRequest`.

---

### Component 4: Session Service Updates

#### [MODIFY] [session_service.py](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/app/services/session_service.py)

1. **Per-outlet duration**: Replace `SESSION_DURATION_MINUTES = 30` with `Restaurant.session_duration_minutes` lookup

2. **Basket locking enforcement** (rewrite of `start_or_resume_session`):
   - Query for ANY active session on this basket (`table_number`)
   - Same normalized name → resume (existing flow, extend expiry)
   - Different name → HTTP 409 "This basket is currently in use by {name}"
   - No active session → create new

3. **`expire_session(session_id)`**: Set status `EXPIRED`, archive session_key. (Abandoned cart pushed separately by frontend.)

4. **`terminate_session(session_id, terminated_by_id, reason?)`**: Set status `TERMINATED`, record who and why, archive session_key. Log via `audit_service`.

5. **`extend_session(session_id)`**: Extend `expires_at` by outlet's `session_duration_minutes`. No cap.

6. **`save_abandoned_cart(session_id, items, total_estimate)`**: Store the JSON snapshot pushed by frontend.

7. **Refactor `check_session_completion()`**: Set status `COMPLETED` instead of `is_active = False`.

---

### Component 5: Admin Sessions Router

#### [NEW] [sessions.py](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/app/routers/admin/sessions.py)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/admin/sessions` | Staff+ | List active sessions for outlet |
| `GET /api/admin/sessions/abandoned-carts` | Staff+ | List abandoned carts (recent first) |
| `GET /api/admin/sessions/abandoned-carts/count` | Staff+ | Un-converted count (for badge) |
| `POST /api/admin/sessions/{id}/terminate` | Manager+ | Terminate active session |
| `POST /api/admin/abandoned-carts/{id}/convert` | Staff+ | Convert → manual bill via existing billing |

---

### Component 6: Public Session Endpoints

#### [MODIFY] [sessions.py](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/app/routers/public/sessions.py)

| Endpoint | Description |
|----------|-------------|
| `POST /api/sessions/{id}/extend` | Customer extends session (no auth) |
| `POST /api/sessions/{id}/abandon-cart` | Frontend pushes local cart on expiry (no auth, session ID is token) |
| Existing `GET /api/sessions/{id}` | Add `expires_at`, `session_duration_minutes`, `status` to response |

#### [MODIFY] [session.py](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/app/schemas/session.py)
- Add `expires_at`, `session_duration_minutes` to `StartSessionResponse`
- Add `status` to `SessionStatusResponse`
- New `AbandonCartRequest` and `ExtendSessionResponse` schemas

---

### Component 7: Frontend Changes

#### [MODIFY] [SessionContext.tsx](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/frontend/src/context/SessionContext.tsx)
- Track `expiresAt`, `sessionDurationMinutes`
- Add `extendSession()` → `POST /api/sessions/{id}/extend`
- Add `abandonCart()` → serializes CartContext items → `POST /api/sessions/{id}/abandon-cart`
- Countdown timer: fires warning at 2 min before expiry
- Expose `timeRemaining`, `isExpiryWarning` to consumers
- On actual expiry: call `abandonCart()` with current cart, then `clearSession()`

#### [NEW] [SessionExpiryWarning.tsx](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/frontend/src/components/SessionExpiryWarning.tsx)
- Floating warning shown ~2 min before expiry
- "Extend Session" button, countdown display
- On decline/timeout: push cart → expire

#### [MODIFY] [admin/page.tsx](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/frontend/src/app/admin/page.tsx)
- **Draft Cart badge**: Distinct icon in sidebar/header showing un-converted abandoned cart count
- **Abandoned Carts panel**: Lists carts with customer name, basket #, items summary, timestamp
- "Convert to Bill" action per cart → calls conversion endpoint
- **Active Sessions panel**: Active sessions with basket #, customer, time remaining, "Terminate" for Manager+
- **Outlet Settings**: Session duration field (minutes) editable by Manager+ only

#### [MODIFY] [index.ts](file:///x:/Onedrive/Desktop/apnagreenbasket/restaurant-app/frontend/src/types/index.ts)
- Add `SessionStatus` type, `AbandonedCart` interface, updated session response types

---

## Verification Plan

### Build Verification
- `npx next build` — 0 TypeScript errors

### Manual Verification
- Session creation with basket locking (same name resumes, different name blocked)
- Session expiry → frontend pushes local cart → abandoned cart created in backend
- Session extension from customer UI
- Manual termination from admin dashboard
- Abandoned cart → bill conversion
- Session duration configurable in outlet settings
