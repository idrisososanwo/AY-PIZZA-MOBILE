# AY PIZZA & ICE CREAM — PHASE 5.4.3
# PRE-MIGRATION SAFETY AUDIT & ARCHITECTURAL VERIFICATION REPORT

**Target Migration:** `supabase/migrations/20261105000001_phase5_4_3_order_transit_tracking.sql`  
**Application Target:** AY Pizza & Ice Cream Customer Mobile Application (`ng.aypizza.app`)  
**Database Architecture:** PostgreSQL 15+ / Supabase  
**Audit Date:** November 2026  
**Auditor:** Antigravity Advanced Agentic Engineering  
**Scope:** Static Analysis, Dependency Tracing, Security Verification & Migration Safety (Zero remote execution or data mutation)

---

## 1. Executive Summary & Verdict

This safety audit was conducted prior to applying migration `20261105000001_phase5_4_3_order_transit_tracking.sql` to the AY Pizza staging/production Supabase databases.

### Audit Verdict: **NOT SAFE TO APPLY WITHOUT PROPOSED CORRECTIONS**
*(Status transitions to **SAFE TO APPLY** immediately upon applying the 2 surgical SQL corrections detailed in Section 5 of this report).*

### Summary of Critical Findings:
1. **Timestamp Skew Vulnerability (Critical):** `v_now` was initialized as `v_now TIMESTAMPTZ := timezone('utc'::text, now());`. In PostgreSQL, `timezone('utc', timestamptz)` converts `TIMESTAMPTZ` to a `TIMESTAMP WITHOUT TIME ZONE`. Reassigning this to a `TIMESTAMPTZ` variable forces PostgreSQL to cast it using the session's active timezone. If the Postgres session or server timezone is anything other than UTC (e.g. `Africa/Lagos` UTC+1), the timestamp is skewed by 1 hour. This must be corrected to use standard `clock_timestamp()` or `now()`.
2. **Order Status Event Trigger Preservation (Verified Safe):** `public.orders` utilizes trigger `trg_order_status_transition AFTER UPDATE OF status ... EXECUTE FUNCTION public.handle_order_status_transition()`. Replacing `transition_order_status` preserves this trigger intact. Because `transition_order_status` executes an `UPDATE public.orders SET status = ...`, the trigger automatically captures the transition and inserts into `order_status_events` without any duplicate insertion.
3. **Cancellation & Refund Pipeline Compatibility (Verified Safe):** Cancellation of confirmed/in-progress orders sets `refund_status = 'REFUND_REQUIRED'` (complying with the `CHECK` constraint defined in migration `20261022000006`). It does not falsely mark refunds as completed, and repeated requests are locked with concurrency checks (`FOR UPDATE`, `CONCURRENT_MODIFICATION`, `ALREADY_CANCELLED`).
4. **Role-Based Authorization (Verified Safe with Documented Legacy Role Behavior):** The RPC enforces separation between `kitchen` and `counter` staff. The general `staff` role retains general operational capabilities (matching TypeScript `Permissions`), while manager/admin authority is preserved.
5. **Search Path Conformance (Hardening Correction):** The RPCs `transition_order_status` and `get_kds_orders` included `auth` in their `search_path`. To maintain strict conformance with Phase 4.1.3 DEF-01 security hardening (`20261022000007`), the search path should be strictly `public, pg_temp`.

---

## 2. Detailed Findings by Audit Domain

### Domain 1: Timestamp Correctness & Timezone Handling

#### Current Implementation in Migration:
```sql
v_now TIMESTAMPTZ := timezone('utc'::text, now());
```

#### Technical Analysis:
- `now()` in PostgreSQL returns `TIMESTAMP WITH TIME ZONE` (`TIMESTAMPTZ`) referencing the server's system clock at transaction start.
- In PostgreSQL, the function `timezone(zone text, timestamp with time zone)` converts a `TIMESTAMPTZ` to `TIMESTAMP WITHOUT TIME ZONE` representing the wall-clock time in that zone:
  $$\text{timezone}('utc', \text{now}()) \longrightarrow \text{timestamp without time zone}$$
- Variable `v_now` is declared as `TIMESTAMPTZ`. Assigning a `TIMESTAMP WITHOUT TIME ZONE` to a `TIMESTAMPTZ` variable invokes an implicit type coercion:
  $$\text{timestamp without time zone} \xrightarrow{\text{implicit cast}} \text{timestamptz at session time zone}$$
- **Vulnerability Demonstration:**
  If the PostgreSQL connection session has `SET timezone = 'Africa/Lagos'` (WAT, UTC+1):
  1. Suppose current UTC time is `12:00:00Z`.
  2. `now()` = `13:00:00+01`.
  3. `timezone('utc', now())` strips the offset and yields `12:00:00` (without timezone).
  4. Assigning `12:00:00` into `v_now TIMESTAMPTZ` under session timezone `Africa/Lagos` interprets `12:00:00` as Lagos time, resulting in `12:00:00+01` = `11:00:00Z`!
  5. The recorded timestamp is shifted backward by 1 full hour.
- **PostgreSQL Native Representation:**
  PostgreSQL stores all `TIMESTAMPTZ` values internally as an 8-byte integer representing UTC microseconds since 2000-01-01. Timezone offset formatting is applied purely at display/serialization time.
- **Required Correction:**
  Use `clock_timestamp()` or `now()` directly without timezone conversion:
  ```sql
  v_now TIMESTAMPTZ := clock_timestamp();
  ```
  This guarantees that all lifecycle timestamps (`accepted_at`, `prepared_at`, `ready_at`, `in_transit_at`, `completed_at`, `updated_at`) store genuine, unadulterated UTC timestamps.

---

### Domain 2: Order Status Event Integrity

#### Inspection of Existing Infrastructure:
- **Table:** `public.order_status_events` (created in migration `20261022000008`).
  - Columns: `order_id`, `previous_status`, `new_status`, `version`, `actor_type`, `actor_id`, `title`, `description`, `metadata`, `created_at`.
  - Immutability: Protected by trigger `trg_prevent_order_event_modification` (blocks `UPDATE` and `DELETE`).
- **Trigger Function:** `public.handle_order_status_transition()` (defined in migration `20261022000008`, lines 278–431).
- **Trigger Definition:**
  ```sql
  CREATE TRIGGER trg_order_status_transition
      AFTER UPDATE OF status ON public.orders
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION public.handle_order_status_transition();
  ```

#### Evaluation:
1. **Preservation of Automatic Event Creation:**
   In `transition_order_status`, the update is executed as:
   ```sql
   UPDATE public.orders
   SET status = p_target_status,
       version = v_order.version + 1,
       ...
   ```
   Because `OLD.status IS DISTINCT FROM NEW.status` evaluates to `TRUE`, `trg_order_status_transition` fires automatically.
2. **Compatibility with `IN_TRANSIT`:**
   Lines 347–349 of `handle_order_status_transition()` already account for delivery dispatch:
   ```sql
   WHEN 'IN_TRANSIT' THEN
       v_title := 'AY Pizza: On the Way!';
       v_body := 'Your order is with the courier heading to ' || COALESCE(NEW.landmark_name, 'your landmark') || '.';
   ```
3. **No Duplicate Events:**
   `transition_order_status` writes exclusively to `public.audit_logs` (for internal staff operations). It does NOT write directly to `public.order_status_events`. The trigger is the sole author of `order_status_events`. No duplicate event entries will be generated.
4. **Historical Backfill Safety:**
   The historical backfill query in migration `20261105000001`:
   ```sql
   UPDATE public.orders o
   SET in_transit_at = sub.transit_time
   FROM (...) sub
   WHERE o.id = sub.order_id AND o.in_transit_at IS NULL;
   ```
   does NOT update the `status` column. Because the trigger is conditioned on `AFTER UPDATE OF status`, the trigger will NOT fire during the backfill. Existing orders will not emit spurious notifications.

---

### Domain 3: Cancellation and Refund Integrity

#### Inspection of Existing Schema:
- **Column:** `public.orders.refund_status`
- **Constraint:** Defined in migration `20261022000006_phase4_1_1_adversarial_hardening.sql`:
  ```sql
  CHECK (refund_status IN ('NOT_APPLICABLE', 'REFUND_REQUIRED', 'REFUND_PENDING', 'REFUNDED'))
  ```
- **Index:** `idx_orders_refund_status ON public.orders (refund_status) WHERE refund_status != 'NOT_APPLICABLE'`

#### Verification:
1. **Status Validity:**
   `REFUND_REQUIRED` is an explicit, valid value in the database `CHECK` constraint.
2. **Cancellation Workflow:**
   When an active paid order (`CONFIRMED`, `ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `IN_TRANSIT`) is cancelled, `transition_order_status` transitions the status:
   ```sql
   v_new_refund_status := v_order.refund_status;
   IF p_target_status = 'CANCELLED' AND v_order.status IN ('CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT') THEN
       v_new_refund_status := 'REFUND_REQUIRED';
   END IF;
   ```
3. **Prevention of False Refund Claims:**
   Setting `refund_status = 'REFUND_REQUIRED'` explicitly indicates that financial reconciliation is needed. It does NOT set `refund_status = 'REFUNDED'`. The customer tracking UI renders this as:
   `"Your order was cancelled after payment. A refund has been flagged for manager review."`
4. **Idempotency and Concurrency:**
   - Orders in `CANCELLED`, `DELIVERED`, or `REFUNDED` status are locked by `FOR UPDATE` and blocked by terminal state guards (`TERMINAL_STATE` or `ALREADY_CANCELLED`).
   - If a client resubmits a cancellation request, it receives:
     ```json
     { "success": false, "code": "ALREADY_CANCELLED", "message": "Order is already cancelled." }
     ```
   - No duplicate refund records or status mutations can occur.
5. **Paystack Payment Compatibility:**
   In `20261021000006_phase3_1_security_verification.sql` (line 586), if Paystack webhook sends a late authorization for an order that was cancelled, the webhook logs:
   `'Order is CANCELLED. Requires immediate merchant refund.'`
   The updated RPC is 100% compatible with this logic.

---

### Domain 4: Role-Based Authorization

#### Inspection of `user_role` Enum:
Defined across `20261021000001` and `20261022000005`:
`public.user_role AS ENUM ('customer', 'staff', 'admin', 'rider', 'kitchen', 'counter', 'manager')`

#### Operational Matrix Enforced by `transition_order_status`:

| Role | Accept (`ACCEPTED`) | Prep (`PREPARING`) | Ready (`READY_FOR_PICKUP`) | Dispatch (`IN_TRANSIT`) | Deliver/Collect (`DELIVERED`) | Cancel (`CANCELLED`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`kitchen`** | ✅ | ✅ | ✅ | ❌ *(Blocked)* | ❌ *(Blocked)* | ❌ *(Blocked)* |
| **`counter`** | ✅ | ❌ *(Blocked)* | ✅ | ✅ *(Delivery)* | ✅ *(Pickup)* | ✅ *(With Reason)* |
| **`manager`** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **`admin`** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **`staff`** *(General)* | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **`customer`** | ❌ *(Forbidden)* | ❌ *(Forbidden)* | ❌ *(Forbidden)* | ❌ *(Forbidden)* | ❌ *(Forbidden)* | ❌ *(Forbidden)* |
| **`rider`** | ❌ *(Forbidden)* | ❌ *(Forbidden)* | ❌ *(Forbidden)* | ❌ *(Forbidden)* | ❌ *(Forbidden)* | ❌ *(Forbidden)* |
| **`service_role`** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

#### Privilege Analysis for General `staff` Role:
- The general `staff` role is a legacy enum value originating from Phase 1 prior to specialized physical tablet logins (`kitchen`, `counter`).
- In `src/domains/auth/auth-service.ts`, `staff` possesses both `UPDATE_ORDER_PREPARATION_STATUS` and `COMPLETE_ORDER_HANDOVER`.
- In the SQL implementation, `staff` is permitted to execute both kitchen and counter actions. This is necessary to support single-staff or multi-duty store shifts where one employee operates both the stone oven and counter register.
- However, `staff` cannot execute `PROCESS_PAYMENT_REFUND` or `MODIFY_PRICES` (strictly restricted to `admin` in `auth-service.ts` and Paystack management).
- **Service-Role Safety:** `v_is_service_role` is checked via `current_setting('request.jwt.claim.role', true) = 'service_role'`. This is restricted strictly to backend Supabase service-key execution.

---

### Domain 5: RPC Compatibility and Security

#### 1. `public.transition_order_status`
- **Signature:** `(p_order_id UUID, p_target_status public.order_status, p_reason TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL, p_expected_current_status public.order_status DEFAULT NULL)`
- **Return Type:** `JSONB`
- **Security:** `SECURITY DEFINER`
- **Search Path:** Must be `SET search_path = public, pg_temp` (aligned with Phase 4.1.3 DEF-01).
- **Grants:**
  ```sql
  REVOKE ALL ON FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status) TO authenticated, service_role;
  ```

#### 2. `public.get_order_by_receipt`
- **Signature:** `(p_order_id UUID, p_receipt_token TEXT)`
- **Return Type:** `JSONB`
- **Security:** `SECURITY DEFINER`
- **Search Path:** `SET search_path = public, pg_temp`
- **Cryptographic Hashing:** Uses `encode(digest(TRIM(p_receipt_token), 'sha256'), 'hex')`.
- **Output Enrichment:** Includes `'in_transit_at', v_order.in_transit_at` along with all historical columns, `items`, and `events`.
- **Grants:**
  ```sql
  REVOKE ALL ON FUNCTION public.get_order_by_receipt(UUID, TEXT) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.get_order_by_receipt(UUID, TEXT) TO authenticated, anon, service_role;
  ```

#### 3. `public.get_kds_orders`
- **Signature:** `(p_statuses public.order_status[] DEFAULT ARRAY['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT']::public.order_status[])`
- **Return Type:** `JSONB`
- **Security:** `SECURITY DEFINER`
- **Search Path:** Must be `SET search_path = public, pg_temp` (aligned with Phase 4.1.3 DEF-01).
- **Output Enrichment:** Includes `'inTransitAt', o.in_transit_at`.
- **Grants:**
  ```sql
  REVOKE ALL ON FUNCTION public.get_kds_orders(public.order_status[]) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_kds_orders(public.order_status[]) TO authenticated, service_role;
  ```

---

### Domain 6: Migration Safety & Idempotency

1. **Forward-Only Structure:**
   - `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS in_transit_at TIMESTAMPTZ;`
   - `CREATE INDEX IF NOT EXISTS idx_orders_in_transit_at ...`
   Both statements use `IF NOT EXISTS` and do not rewrite table data or block live read/write traffic.
2. **Re-Run Safety (Idempotency):**
   - The backfill query specifically filters: `WHERE o.id = sub.order_id AND o.in_transit_at IS NULL;`. If re-run, no previously backfilled records are touched.
   - All functions use `CREATE OR REPLACE FUNCTION`.
3. **Preservation of Existing Records:**
   - No columns are dropped.
   - No default constraints overwrite existing order fields.
   - No foreign key or check constraints on unrelated tables are affected.

---

## 3. Specific Problems Found

| Issue ID | Severity | File / Location | Description |
| :--- | :---: | :--- | :--- |
| **SEC-01** | **HIGH** | `transition_order_status`, Line 50 | `v_now TIMESTAMPTZ := timezone('utc'::text, now());` strips timezone information into `timestamp without time zone` before re-casting to `timestamptz`, introducing up to 1-hour timestamp skew if the Postgres session timezone is non-UTC. |
| **SEC-02** | **MEDIUM** | `transition_order_status` & `get_kds_orders`, Lines 44 & 476 | `SET search_path = public, auth, pg_temp` deviates from the approved Phase 4.1.3 DEF-01 standard (`public, pg_temp`). Calls to `auth.uid()` are fully qualified and do not require `auth` in search_path. |

---

## 4. Exact Proposed SQL Corrections

### Correction 1: Timestamp Initialization
Replace:
```sql
v_now TIMESTAMPTZ := timezone('utc'::text, now());
```
With:
```sql
v_now TIMESTAMPTZ := clock_timestamp();
```

### Correction 2: Strict Search Path Conformance
In `transition_order_status`:
Replace:
```sql
SET search_path = public, auth, pg_temp
```
With:
```sql
SET search_path = public, pg_temp
```

In `get_kds_orders`:
Replace:
```sql
SET search_path = public, auth, pg_temp
```
With:
```sql
SET search_path = public, pg_temp
```

---

## 5. Unresolved Operational Risks for Human Review

1. **Supabase Webhook Ingestion vs Database Triggers:**
   While `order_status_events` is automatically populated by trigger `trg_order_status_transition`, external push notification delivery relies on an active background worker draining `public.notification_outbox`. This is an existing operational dependency and is unaffected by this migration.
2. **Historical Orders Dispatched Before Audit Events Table Inception:**
   Orders created before Phase 4.2 (October 22, 2026) that lacked `order_status_events` will have `in_transit_at` remain `NULL`. This is mathematically correct since factual historical dispatch data does not exist for those legacy test orders.
3. **Execution Environment:**
   This migration must be applied through the Supabase SQL Editor by a database administrator with superuser/service-role credentials.

---

## 6. Final Recommendation

Following the application of the two surgical SQL corrections documented in Section 4:

### Final Verdict: **SAFE TO APPLY**

The corrected migration is safe, forward-only, idempotent, adheres strictly to the existing schema constraints, preserves all automated audit triggers, and eliminates potential timezone skews.

