# AY PIZZA — PHASE 6.0: OPERATIONAL BACKEND SAFEGUARDS REPORT

## Executive Summary

Phase 6.0 establishes the operational backend safeguards required before building the Admin Dashboard and Rider Operations system for AY Pizza & Ice Cream. This phase addresses the critical architectural and operational gaps uncovered during the Phase 5.8 Kitchen & Admin Audit:

1. **Rider Permission Inconsistency Resolved**: Reconciled client-side rider permissions (`UPDATE_DELIVERY_STATUS`) with database order transitions. Riders can now update only delivery orders explicitly assigned to them, and strictly through permitted delivery status transitions (`READY_FOR_PICKUP` -> `IN_TRANSIT`, `IN_TRANSIT` -> `DELIVERED`). No unrestricted kitchen access or bypassing of preparation stages is permitted.
2. **Server-Side Opening Hours & Temporary Closures Enforced**: Replaced client-only business hour checks with a database-backed schedule (`store_operating_hours`) and operational controls (`delivery_config`) evaluated in Lagos local time (`Africa/Lagos`, WAT / UTC+1). Implemented a **Safe Configuration Model** (`enforce_operating_hours BOOLEAN DEFAULT FALSE`, `operating_hours_confirmed_by_owner BOOLEAN DEFAULT FALSE`) so provisional operating hours (10:00–21:00) do not unintentionally block testing or operations until formally confirmed by the business owner.
3. **Refund Management Foundation Established**: Expanded `orders.refund_status` to include `'REFUND_FAILED'`, created an immutable `refund_records` audit table, and implemented server-authoritative RPCs (`initiate_order_refund`, `record_refund_outcome`) with row-level locking, idempotency protection, original payment verification, and zero client-side exposure of Paystack secret keys.

---

## 1. Findings and Root Causes

### 1.1 Rider Permission Inconsistency
- **Finding**: Client-side `auth-service.ts` defined permission `UPDATE_DELIVERY_STATUS` and granted it to role `'rider'`. However, PostgreSQL function `transition_order_status` strictly enforced `IF v_caller_role NOT IN ('kitchen', 'manager', 'admin', 'counter') THEN RAISE EXCEPTION 'INSUFFICIENT_PERMISSIONS'`. Any attempt by a rider to transition an order failed at the database level.
- **Underlying Architectural Gap**: The `orders` table lacked an `assigned_rider_id` column. Orders were not associated with individual delivery riders, making it impossible to enforce least-privilege access where a rider only interacts with orders they have been dispatched to deliver.
- **Root Cause**: The rider role was introduced conceptually in client auth definitions, but operational rider dispatch and status transitions had not yet been designed or implemented in the database schema.

### 1.2 Store Opening Hours & Closure Enforcement
- **Finding**: Store opening hours were validated only on the client (`src/constants/brand.ts` defined `10:00 - 21:00`). Server-authoritative order creation (`create_order_authoritative`) performed zero temporal validation. A customer could place an order at 03:00 AM WAT, and as long as their cart items and prices were valid, the order would be created and Paystack payment initialized.
- **Underlying Risk**: Hard-enforcing the provisional 10:00–21:00 schedule immediately in the database posed a severe risk because these hours were never formally verified or signed off by the business owner. Immediate database enforcement would silently block late-night testing or off-hours operations.
- **Temporary Closure Gap**: There was no server-side mechanism to pause ordering during sudden operational emergencies (e.g., kitchen equipment maintenance, generator outage, severe local weather, or order rush throttling).
- **Fulfillment Independence Gap**: There was no way to pause delivery while keeping pickup active, or vice-versa.

### 1.3 Refund Management Foundation
- **Finding**: The database check constraint on `orders.refund_status` was:
  ```sql
  CHECK (refund_status IN ('NOT_APPLICABLE', 'REFUND_REQUIRED', 'REFUND_PENDING', 'REFUNDED'))
  ```
  If an automated or gateway refund attempt failed, the database had no valid state to record the failure (`REFUND_FAILED`), risking unhandled database exceptions or leaving orders permanently stuck in `REFUND_PENDING`.
- **Underlying Financial Risk**: There was no dedicated audit table (`refund_records`) tracking individual refund transactions, gateway response identifiers, idempotency keys, initiator profiles, or error details.
- **Security Boundary**: Gateway refund execution requires the Paystack Secret Key. Under no circumstances may secret keys or refund API endpoints be called directly from mobile client bundles.

---

## 2. Existing and Revised Architecture

```
========================================================================================
                          REVISED OPERATIONAL ARCHITECTURE
========================================================================================

   CUSTOMER CLIENT                      RIDER APP                      KITCHEN / ADMIN
          │                                 │                                 │
          │ [create_order_authoritative]   │ [transition_order_status]       │ [assign_order_rider]
          ▼                                 ▼                                 │ [transition_order_status]
┌────────────────────────────────────────────────────────────────────────┐    │ [initiate_order_refund]
│                       SUPABASE POSTGRESQL ENGINE                       │    ▼
├────────────────────────────────────────────────────────────────────────┴───────────────────────┐
│                                                                                                │
│  1. OPERATIONAL SCHEDULE & CLOSURE ENGINE                                                      │
│     - store_operating_hours (Day 0-6, open/close, overnight, delivery_active, pickup_active)   │
│     - delivery_config (is_temporarily_closed, enforce_operating_hours, Africa/Lagos WAT)       │
│     - check_store_operational_status(p_fulfillment_type)                                      │
│       * Safe Configuration Model: Unconfirmed hours provide advisory status unless enforced   │
│                                                                                                │
│  2. RIDER DISPATCH & SECURE TRANSITION CONTROL                                                 │
│     - orders.assigned_rider_id REFERENCES profiles(id)                                        │
│     - assign_order_rider(order_id, rider_id, notes) [Counter/Manager/Admin only]              │
│     - transition_order_status:                                                                │
│       * Riders restricted to: assigned_rider_id = caller AND fulfillment = 'delivery'          │
│       * Riders permitted ONLY: READY_FOR_PICKUP -> IN_TRANSIT -> DELIVERED                    │
│       * Kitchen/Counter/Admin maintain full lifecycle authority                                │
│                                                                                                │
│  3. AUDITABLE REFUND MANAGEMENT FOUNDATION                                                     │
│     - orders.refund_status CHECK: NOT_APPLICABLE | REFUND_REQUIRED | REFUND_PENDING |          │
│                                   REFUNDED | REFUND_FAILED                                     │
│     - refund_records (order_id, amount_kobo, idempotency_key, gateway_refund_id, audit logs)    │
│     - initiate_order_refund(order_id, reason, amount_kobo, idempotency_key) [Manager/Admin]   │
│     - record_refund_outcome(refund_id, outcome, gateway_id, error) [Admin/Service Role]        │
│                                                                                                │
└────────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                                 │
                                                 ▼
                                     ┌───────────────────────┐
                                     │ SUPABASE EDGE FUNCTION│ (Server-Side Only)
                                     │ - Paystack Secret Key │
                                     │ - /refund API call    │
                                     └───────────────────────┘
```

### 2.1 Rider Permission Model
- **Assignment**: Counter staff, managers, and admins assign orders to active riders via `assign_order_rider()`. The assignment logs who assigned the rider, records the timestamp, appends notes to `order_status_history`, and sets `orders.assigned_rider_id`.
- **Transitions**:
  - `READY_FOR_PICKUP` -> `IN_TRANSIT`: Rider confirms pickup from the kitchen.
  - `IN_TRANSIT` -> `DELIVERED`: Rider confirms completion at the customer's delivery address.
- **Restrictions**:
  - Riders cannot accept, prepare, or cancel orders.
  - Riders cannot transition pickup orders.
  - Riders cannot touch orders assigned to other riders.
  - Riders cannot jump directly from earlier statuses (`CONFIRMED`, `PREPARING`) to delivery statuses.

### 2.2 Operating Hours & Safe Configuration Model
- **Timezone**: Evaluated strictly in `Africa/Lagos` (West Africa Time, UTC+1).
- **Provisional Schedule**: Default seeded hours are 10:00:00 to 21:00:00 daily (Sunday through Saturday).
- **Safe Configuration Flags**:
  - `enforce_operating_hours`: Defaults to `FALSE`.
  - `operating_hours_confirmed_by_owner`: Defaults to `FALSE`.
- **Operational Enforcement**:
  - When `enforce_operating_hours = TRUE`: If the store is closed, temporarily shut down, or if the selected fulfillment type is disabled, `create_order_authoritative` aborts with descriptive error codes (`STORE_CLOSED_OFF_HOURS`, `STORE_TEMPORARILY_CLOSED`, `DELIVERY_CURRENTLY_UNAVAILABLE`, `PICKUP_CURRENTLY_UNAVAILABLE`).
  - When `enforce_operating_hours = FALSE`: The system evaluates operational state and returns it as advisory metadata (`OFF_HOURS_UNENFORCED`), allowing normal order placement for development and physical testing without disruption.
- **Temporary Emergency Closure**:
  - Can be toggled with an optional `reopen_at` timestamp and human-readable reason.
  - If `reopen_at` has passed, the temporary closure automatically expires without manual intervention.

### 2.3 Refund Architecture
- **Order State**: Supports `'NOT_APPLICABLE'`, `'REFUND_REQUIRED'`, `'REFUND_PENDING'`, `'REFUNDED'`, and `'REFUND_FAILED'`.
- **Row Locking**: `initiate_order_refund` locks the order row using `SELECT ... FOR UPDATE` to eliminate race conditions.
- **Validation**:
  - Original payment reference must exist.
  - Order must be in a refundable state (`CANCELLED` or payment verified).
  - Refund amount must not exceed original payment amount.
  - Idempotency key prevents duplicate refund attempts.
- **Paystack Secret Isolation**: The client app never interacts with Paystack's refund API. The client initiates intent via `initiate_order_refund` (Manager/Admin). A background Edge Function or server worker processes the pending record using backend secrets and writes the outcome back via `record_refund_outcome`.

---

## 3. Database Migrations and Functions Changed

### Migration: `supabase/migrations/20261107000001_phase6_0_operational_backend_safeguards.sql`

#### 3.1 Schema Additions & Modifications
1. **`public.orders`**:
   - Added column `assigned_rider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL`.
   - Added index `idx_orders_assigned_rider_id` on `orders(assigned_rider_id)`.
   - Updated check constraint `orders_refund_status_check` to:
     ```sql
     CHECK (refund_status IN ('NOT_APPLICABLE', 'REFUND_REQUIRED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'))
     ```
2. **`public.store_operating_hours`**:
   - Columns: `day_of_week` (0-6, PK), `day_name`, `is_open`, `open_time`, `close_time`, `is_overnight`, `delivery_active`, `pickup_active`, `updated_at`, `updated_by`.
   - Seeded with 7 days (Sunday through Saturday, 10:00–21:00, all active).
3. **`public.delivery_config`**:
   - Added columns:
     - `is_temporarily_closed BOOLEAN NOT NULL DEFAULT FALSE`
     - `temporary_closure_reason TEXT`
     - `temporary_closure_reopen_at TIMESTAMPTZ`
     - `enforce_operating_hours BOOLEAN NOT NULL DEFAULT FALSE`
     - `operating_hours_confirmed_by_owner BOOLEAN NOT NULL DEFAULT FALSE`
     - `store_timezone TEXT NOT NULL DEFAULT 'Africa/Lagos'`
4. **`public.refund_records`**:
   - Columns: `id` (UUID PK), `order_id` (FK `orders`), `original_payment_reference`, `gateway_refund_id`, `amount_kobo`, `currency` (DEFAULT 'NGN'), `refund_status` (DEFAULT 'PENDING'), `reason`, `idempotency_key` (UNIQUE), `initiated_by` (FK `profiles`), `error_message`, `metadata`, `created_at`, `updated_at`.
   - RLS enabled: Staff/Admins can view; only Managers/Admins or Service Role can insert/update.

#### 3.2 Stored Functions / RPCs
1. **`public.assign_order_rider(p_order_id UUID, p_rider_id UUID, p_notes TEXT)`**:
   - `SECURITY DEFINER`, `search_path = public, pg_temp`.
   - Caller must be `counter`, `manager`, or `admin`.
   - Validates rider exists and has role `rider` in `profiles`.
   - Verifies order is a delivery order (`fulfillment_type = 'delivery'`).
   - Verifies order is not in a terminal state (`CANCELLED`, `DELIVERED`).
   - Appends transition note to `orders.order_status_history`.
2. **`public.transition_order_status(...)`**:
   - Hardened caller verification:
     - Allows `kitchen`, `counter`, `manager`, `admin` for kitchen lifecycle transitions.
     - Allows `rider` ONLY IF:
       1. Order fulfillment is `delivery`.
       2. `order.assigned_rider_id = auth.uid()`.
       3. Target status is either `IN_TRANSIT` or `DELIVERED`.
       4. Current status is `READY_FOR_PICKUP` (for `IN_TRANSIT`) or `IN_TRANSIT` (for `DELIVERED`).
     - Any other status attempt by a rider throws `INSUFFICIENT_PERMISSIONS`.
3. **`public.check_store_operational_status(p_fulfillment_type TEXT)`**:
   - `SECURITY DEFINER`, `search_path = public, pg_temp`.
   - Calculates Lagos time: `v_now_lagos := clock_timestamp() AT TIME ZONE v_timezone`.
   - Evaluates temporary emergency closure and auto-expiration.
   - Evaluates day of week and open/close schedule (including overnight logic).
   - Evaluates fulfillment-specific active status (`delivery_active` vs `pickup_active`).
   - Checks `enforce_operating_hours` flag to return actionable operational status (`OPEN`, `CLOSED_OFF_HOURS`, `TEMPORARILY_CLOSED`, `FULFILLMENT_UNAVAILABLE`, `OFF_HOURS_UNENFORCED`).
4. **`public.create_order_authoritative(...)`**:
   - Integrated call to `check_store_operational_status(p_fulfillment_type)`.
   - If `enforce_operating_hours` is true and store is not open, raises clear operational exception.
   - If `enforce_operating_hours` is false, records advisory operational metadata and permits checkout.
5. **`public.initiate_order_refund(...)`**:
   - `SECURITY DEFINER`, `search_path = public, pg_temp`.
   - Caller must be `manager` or `admin`.
   - Locks order row `FOR UPDATE`.
   - Enforces unique idempotency key.
   - Validates payment reference exists and refund amount <= paid amount.
   - Sets `orders.refund_status = 'REFUND_PENDING'` and creates `refund_records` row in `PENDING` state.
6. **`public.record_refund_outcome(...)`**:
   - `SECURITY DEFINER`, `search_path = public, pg_temp`.
   - Caller must be `admin` or `service_role`.
   - Updates `refund_records` status (`SUCCESS` or `FAILED`) with gateway refund id or error message.
   - Updates `orders.refund_status` to `'REFUNDED'` (on success) or `'REFUND_FAILED'` (on failure).

---

## 4. Security Implications

| Area | Security Measure | Benefit |
|---|---|---|
| **Rider Boundary** | Strict row-level ownership + transition whitelist | Riders cannot view or modify orders not assigned to them; riders cannot bypass kitchen preparation stages or cancel orders. |
| **Search Path Hardening** | `SET search_path = public, pg_temp;` on all new/updated RPCs | Eliminates search-path hijacking attacks on `SECURITY DEFINER` functions. |
| **Role Enforcement** | Validated against `public.profiles.role` via `auth.uid()` | Prevents client-side claim spoofing; database evaluates actual database user role. |
| **Payment & Refund Isolation** | Idempotency key + Paystack key isolated from mobile bundle | Eliminates double-refunds and protects payment gateway credentials from client reverse-engineering. |
| **Row-Level Locking** | `FOR UPDATE` on order assignments and refund initiations | Prevents race conditions from simultaneous staff actions or duplicate network requests. |

---

## 5. Tests and Quality Gate Results

### 5.1 Test Suite: `src/__tests__/phase6-0-operational-backend-safeguards.test.ts`
11 comprehensive regression test suites covering all operational safeguards:
1. **Rider Access Control**: Verifies riders cannot transition unassigned orders.
2. **Rider Valid Transitions**: Verifies assigned riders can transition `READY_FOR_PICKUP` -> `IN_TRANSIT` and `IN_TRANSIT` -> `DELIVERED`.
3. **Rider Transition Restrictions**: Verifies riders cannot transition orders backwards, directly to preparation, or cancel orders.
4. **Rider Pickup Restriction**: Verifies riders cannot transition pickup orders.
5. **Kitchen Access Control**: Verifies kitchen and counter staff maintain full kitchen transition authority.
6. **Store Operational Status (Open Hours)**: Verifies Lagos time schedule evaluation during open hours.
7. **Store Operational Status (Off Hours)**: Verifies rejection when enforced and advisory metadata when unenforced.
8. **Temporary Closure**: Verifies temporary closure overrides operating hours and auto-expires after reopen timestamp.
9. **Fulfillment Type Status**: Verifies independent toggling of delivery vs pickup active states.
10. **Refund Initiation**: Verifies Manager/Admin gating, idempotency, and state transition to `REFUND_PENDING`.
11. **Refund Outcome**: Verifies outcome recording for both success (`REFUNDED`) and failure (`REFUND_FAILED`).

### 5.2 Quality Gate Summary
- **TypeScript (`npx tsc --noEmit`)**: 0 errors.
- **ESLint (`npx expo lint`)**: 0 application errors.
- **Jest (`npm test -- --runInBand`)**: 46/46 suites passed, 735/735 tests passed.
- **Expo Doctor (`npx expo-doctor`)**: 20/20 checks passed.

---

## 6. Migration Deployment Status

- **Codebase Migration File**: Created at `supabase/migrations/20261107000001_phase6_0_operational_backend_safeguards.sql`.
- **Deployment Status**: Pending Supabase remote application.
- **Recommended Deployment Steps**:
  1. Review migration file in staging environment.
  2. Apply migration using Supabase CLI:
     ```bash
     npx supabase db push
     ```
     Or execute `20261107000001_phase6_0_operational_backend_safeguards.sql` in the Supabase Dashboard SQL Editor.
  3. Verify created tables and RPCs via Supabase Studio.

---

## 7. Owner Decisions Still Required

> [!IMPORTANT]
> The following operational decisions require formal business owner review and confirmation before enabling strict enforcement in production:

1. **Official Operating Hours Confirmation**:
   - Are the provisional 10:00 to 21:00 (10:00 AM – 9:00 PM) daily hours accurate for AY Pizza & Ice Cream?
   - Does AY Pizza operate different hours on weekends (Friday–Sunday)?
   - Are there specific holidays or closure days?
2. **Enforcement Activation**:
   - When should `enforce_operating_hours` be toggled to `TRUE` in `delivery_config`?
   - (Recommendation: Keep `enforce_operating_hours = FALSE` during staging and preview APK testing; toggle to `TRUE` after owner signs off on the official schedule).
3. **Refund Authorization Policy**:
   - Should Counter staff be allowed to initiate refunds for in-store pickup cancellations, or should refunds remain strictly restricted to Managers and Admins?
4. **Rider Self-Assignment vs Dispatch**:
   - Will riders be manually assigned by counter staff (current model), or will a "pool dispatch" (riders claim available orders) be required in Phase 7?

---

## 8. Remaining Risks & Mitigations

1. **Remote Database Drift**:
   - *Risk*: Code is written to expect `assigned_rider_id`, `store_operating_hours`, and new RPCs. If the client runs against a remote database without the migration applied, RPC calls will fail.
   - *Mitigation*: Client services (`store-operational-service.ts`, `kds-service.ts`) implement resilient fallbacks and error handling that degrade gracefully if the new tables or columns are not yet present on the remote database.
2. **Paystack Secret Key Management**:
   - *Risk*: Initiating actual refunds requires calling Paystack's API with secret credentials.
   - *Mitigation*: Strictly isolated from the mobile client. Paystack refund calls will run inside Supabase Edge Functions where the secret key is securely stored in environment vault secrets.
3. **Timezone Edge Cases**:
   - *Risk*: Daylight savings or system clock skew.
   - *Mitigation*: Nigeria observes West Africa Time (WAT, UTC+1) continuously without daylight saving time. PostgreSQL evaluates `clock_timestamp() AT TIME ZONE 'Africa/Lagos'`, which is immune to client device clock tampering.

