# AY PIZZA & ICE CREAM — PHASE 6.0.4: READ-ONLY CANCELLATION MIGRATION SAFETY REVIEW

**Document Reference**: `docs/phase-6-0-4-cancellation-migration-safety-review.md`  
**Review Date**: 2026-11-07  
**Target Migration**: `supabase/migrations/20261105000002_phase5_5_customer_order_cancellation.sql`  
**Target Supabase Project**: `gmtlwewpblnnkzuwfcib` (`https://gmtlwewpblnnkzuwfcib.supabase.co`)  
**Review Type**: Strictly READ-ONLY Investigation (No writes, no schema repairs, no builds, no pushes)  
**Final Verdict**: **SAFE FOR STAGING DEPLOYMENT**

---

## 1. Executive Summary

This review provides a strict, read-only safety, security, and architectural audit of migration `20261105000002_phase5_5_customer_order_cancellation.sql` and every dependency required to deploy it to the AY Pizza staging Supabase project (`gmtlwewpblnnkzuwfcib`).

### Key Findings
1. **Exact Actual RPC Name & Signature**:
   The function defined is:
   ```sql
   public.cancel_order_by_customer(
       p_order_id UUID,
       p_receipt_token TEXT DEFAULT NULL,
       p_reason TEXT DEFAULT NULL
   ) RETURNS JSONB
   ```
   *(Note: The function was casually referenced in earlier notes as `customer_cancel_order`, but its actual implementation in SQL and client code is `cancel_order_by_customer`).*
2. **Schema Footprint**:
   The migration creates **no new tables**, **no new columns**, **no indexes**, and **no constraints**. It only creates/replaces a single `SECURITY DEFINER` function with appropriate permission grants and comments.
3. **Existing Column Dependencies**:
   All columns referenced (`id`, `receipt_token_hash`, `customer_id`, `status`, `order_number`, `refund_status`, `rejection_reason`, `version`, `updated_at`) already exist on the remote staging database from migrations `20261021000001` through `20261022000006`.
4. **Staging Remote Migration State**:
   Live read-only probing confirms **15 migrations are applied** (`20261021000001` to `20261022000009`) and **4 migrations are pending** (`20261103000001`, `20261105000001`, `20261105000002`, `20261107000001`).
5. **Data Safety**:
   Zero risk of data loss. The migration contains no destructive operations (`DROP`, `TRUNCATE`, `ALTER COLUMN`). It is 100% idempotent and rerunnable.
6. **Verdict**: **`SAFE FOR STAGING DEPLOYMENT`**.

---

## 2. Complete Migration Inspection

### A. Database Objects Audit

| Object Category | Object Name | Action | Details / Definition |
| :--- | :--- | :---: | :--- |
| **Tables** | None | None | No tables created, altered, or dropped. |
| **Columns** | None | None | No columns created, altered, or dropped. |
| **Indexes** | None | None | No indexes created or dropped. |
| **Constraints** | None | None | No table constraints created or dropped. |
| **Triggers** | None | None | No triggers created or modified in migration. *(Fires existing triggers upon runtime UPDATE).* |
| **Functions / RPCs** | `public.cancel_order_by_customer` | **CREATED / REPLACED** | `(p_order_id UUID, p_receipt_token TEXT DEFAULT NULL, p_reason TEXT DEFAULT NULL) RETURNS JSONB` |
| **RLS Policies** | None | None | No RLS policies modified. *(Table-level RLS on `orders` is bypassed via `SECURITY DEFINER`, but strictly gated by internal authorization logic).* |
| **Security Grants** | `cancel_order_by_customer` | **REVOKE / GRANT** | `REVOKE ALL FROM PUBLIC;`<br>`GRANT EXECUTE TO authenticated, anon, service_role;` |
| **Documentation** | `COMMENT ON FUNCTION` | **CREATED** | Explicit docstring registered in Postgres catalog. |

### B. Security Definer Configuration
- **Language**: `plpgsql`
- **Security Mode**: `SECURITY DEFINER` (executes with owner privileges to transition order status while client table UPDATE is blocked by RLS).
- **Search Path**: `SET search_path = public, pg_temp` (explicitly locked down against Trojan schema/function hijacking).
- **Runtime Grants**: Restricted to `authenticated`, `anon`, and `service_role`.

### C. Rerunnability & Transactional Safety
- The migration uses `CREATE OR REPLACE FUNCTION`.
- Executing this migration multiple times is completely idempotent.
- The statements are purely metadata declarations and will run instantaneously inside a Postgres transaction block (`BEGIN ... COMMIT`).

---

## 3. Migration Dependency Trace

### A. Database Schema Dependencies

| Required Object / Column | Source Migration | Staging Status | Purpose in `cancel_order_by_customer` |
| :--- | :--- | :---: | :--- |
| `public.orders.id` | `20261021000001` | **APPLIED** | Primary key lookups & row locking (`FOR UPDATE`). |
| `public.orders.customer_id` | `20261021000001` | **APPLIED** | Authenticated ownership authorization (`auth.uid() = customer_id`). |
| `public.orders.status` | `20261021000001` | **APPLIED** | Checked for `'CONFIRMED'`; updated to `'CANCELLED'`. |
| `public.orders.order_number` | `20261021000001` | **APPLIED** | Returned in JSONB response payload. |
| `public.orders.updated_at` | `20261021000001` | **APPLIED** | Audit timestamp updated to `clock_timestamp()`. |
| `public.orders.receipt_token_hash` | `20261021000006` | **APPLIED** | Cryptographic hash match for anonymous guest cancellations. |
| `public.orders.rejection_reason` | `20261022000005` | **APPLIED** | Records customer-provided cancellation reason. |
| `public.orders.version` | `20261022000006` | **APPLIED** | Optimistic locking counter incremented (`version = version + 1`). |
| `public.orders.refund_status` | `20261022000006` | **APPLIED** | Updated to `'REFUND_REQUIRED'` (allowed by existing check constraint). |
| Extension `pgcrypto` (`digest`) | `20261021000001` | **APPLIED** | Computes SHA-256 hash of plaintext receipt token. |

### B. Trigger & Event Integration Trace
When `cancel_order_by_customer` updates `public.orders`, the following database triggers fire automatically:
1. **`set_orders_updated_at`** (from migration `20261021000001`):
   Sets `updated_at = timezone('utc'::text, now())`.
2. **`trg_order_status_transition`** (from migration `20261022000008`):
   Fires `handle_order_status_transition()` `AFTER UPDATE OF status ON public.orders`:
   - Inserts an immutable row into `public.order_status_events` with:
     - `previous_status`: `'CONFIRMED'`
     - `new_status`: `'CANCELLED'`
     - `title`: `'AY Pizza: Order Cancelled'`
     - `description`: `'Order #' || order_number || ' was cancelled. Please check order details.'`
     - `metadata`: `{"refund_status": "REFUND_REQUIRED", "rejection_reason": ...}`
   - Enqueues push notification records in `public.notification_outbox` for the customer's registered devices with unique idempotency key (`order_id:CANCELLED:token`).

### C. Staging Migration State (Verified via Remote CLI)
A live read-only inspection using `npx supabase migration list --linked` on project `gmtlwewpblnnkzuwfcib` established:

```text
Applied Remote Migrations (15 total):
  ✓ 20261021000001_initial_schema.sql
  ✓ 20261021000002_seed_ay_pizza.sql
  ✓ 20261021000003_security_and_integrity_fixes.sql
  ✓ 20261021000004_catalog_customization_links.sql
  ✓ 20261021000005_phase3_checkout_and_paystack.sql
  ✓ 20261021000006_phase3_1_security_verification.sql
  ✓ 20261022000001_phase3_1_1_security_hardening.sql
  ✓ 20261022000002_phase3_1_2_payment_concurrency.sql
  ✓ 20261022000003_phase3_1_3_payment_reservation.sql
  ✓ 20261022000004_phase3_1_4_ambiguous_outcome_recovery.sql
  ✓ 20261022000005_phase4_1_kds_and_staff_operations.sql
  ✓ 20261022000006_phase4_1_1_adversarial_hardening.sql
  ✓ 20261022000007_phase4_1_3_search_path_hardening.sql
  ✓ 20261022000008_phase4_2_tracking_and_notifications.sql
  ✓ 20261022000009_phase4_2_1_adversarial_hardening.sql

Pending Remote Migrations (4 total):
  ⏳ 20261103000001_phase5_4_delivery_and_addresses.sql
  ⏳ 20261105000001_phase5_4_3_order_transit_tracking.sql
  ⏳ 20261105000002_phase5_5_customer_order_cancellation.sql  <-- TARGET MIGRATION
  ⏳ 20261107000001_phase6_0_operational_backend_safeguards.sql
```

**Crucial Finding on Dependencies**:
Migration `20261105000002` does **not** depend on tables or columns created in pending migrations `20261103000001` (delivery config) or `20261105000001` (`in_transit_at`). All required columns already exist in applied migration `20261022000006`.

---

## 4. Security Review

### A. Dual Authorization Architecture
The function implements strict defense-in-depth authorization:
1. **Guest Access**:
   - The caller passes the plaintext receipt token (`p_receipt_token`).
   - The RPC hashes the token in-memory using `encode(digest(TRIM(p_receipt_token), 'sha256'), 'hex')`.
   - Compares the hash against `orders.receipt_token_hash`.
   - Plaintext tokens are **never logged**, stored in the database, or returned in responses.
2. **Authenticated Access**:
   - If the caller is logged in, `v_caller_id := auth.uid()`.
   - The RPC verifies `orders.customer_id = v_caller_id`.
   - Customers can **only** cancel their own orders.
3. **Unauthorized Denial**:
   - If neither token hash nor customer ownership matches, the transaction aborts with `{ "success": false, "code": "UNAUTHORIZED" }`.

### B. Server-Side Cancellation Window & Policy
- **Policy Enforcement**:
  The function evaluates:
  ```sql
  IF v_order.status != 'CONFIRMED' THEN
      RETURN jsonb_build_object(
          'success', false,
          'code', 'ORDER_ALREADY_ACCEPTED',
          'message', 'This order has already been accepted by the kitchen and cannot be cancelled self-service. Please contact the store directly.',
          'current_status', v_order.status
      );
  END IF;
  ```
- **Lifecycle Window vs. 5-Minute Wall-Clock**:
  The RPC enforces a **strict operational lifecycle boundary** (pre-kitchen acceptance) rather than an arbitrary 5-minute wall-clock cutoff.
  - While an order is `CONFIRMED` (awaiting kitchen acceptance), the customer may cancel.
  - The instant kitchen staff accepts the order on the KDS (`transition_order_status` to `'ACCEPTED'`), the status changes and customer cancellation is immediately blocked.
  - Orders in `ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `IN_TRANSIT`, or `DELIVERED` cannot be cancelled self-service.

### C. Concurrency, Race Conditions & Idempotency
- **Row Locking**:
  `SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;`
  Acquires an exclusive PostgreSQL row lock. If staff attempts to accept the order while the customer attempts to cancel, or if two cancellation requests arrive simultaneously, transactions are serialized.
- **Idempotency Guard**:
  ```sql
  IF v_order.status = 'CANCELLED' THEN
      RETURN jsonb_build_object(
          'success', true,
          'code', 'ALREADY_CANCELLED',
          'message', 'Order is already cancelled.',
          'order_id', v_order.id,
          'order_number', v_order.order_number,
          'status', v_order.status,
          'refund_status', v_order.refund_status
      );
  END IF;
  ```
  Repeated cancellation calls succeed idempotently without creating duplicate events or corrupting version numbers.

### D. RLS & Direct Client Mutation Protection
- Direct client `UPDATE` operations on `public.orders` are blocked by Row Level Security (`42501 permission denied`).
- Clients cannot arbitrarily set `status = 'CANCELLED'` or manipulate `refund_status`.
- `SECURITY DEFINER` with `SET search_path = public, pg_temp` prevents path injection.

---

## 5. Refund Handling & Financial Safety

### A. Refund State Transition
- Upon successful cancellation, `orders.refund_status` is updated to `'REFUND_REQUIRED'`.
- The update increments `orders.version = v_order.version + 1` for optimistic locking consistency.

### B. Integration with Phase 6.0 Operational Safeguards
In Phase 6.0 (`20261107000001_phase6_0_operational_backend_safeguards.sql`), manager refund operations rely on `initiate_order_refund()`:
```sql
-- Phase 6.0 safeguard in initiate_order_refund:
IF v_order.status != 'CANCELLED' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_CANCELLED');
END IF;
```
`cancel_order_by_customer` places the order into the exact expected state (`status = 'CANCELLED'` and `refund_status = 'REFUND_REQUIRED'`) required for manager review.

### C. Financial Safety & Paystack Independence
- `cancel_order_by_customer` **never** triggers an automated Paystack refund.
- No direct outbound HTTP calls to Paystack or payment gateways are made by this function.
- This prevents automated chargeback fraud and protects business liquidity. Refunds require explicit human manager review.

---

## 6. Deployment Plan

### Recommended Deployment Sequencing

Because Supabase CLI manages migrations chronologically, there are two valid paths to deploy:

#### Option 1: Sequential CLI Deployment (Recommended)
Deploy all pending migrations in their designed sequence using Supabase CLI:
```bash
npx supabase db push --project-ref gmtlwewpblnnkzuwfcib
```
**Execution Sequence**:
1. `20261103000001_phase5_4_delivery_and_addresses.sql`
2. `20261105000001_phase5_4_3_order_transit_tracking.sql`
3. `20261105000002_phase5_5_customer_order_cancellation.sql` *(Target)*
4. `20261107000001_phase6_0_operational_backend_safeguards.sql`

#### Option 2: Isolated Target Deployment via Supabase Web SQL Editor
Because migration `20261105000002` has no schema dependencies on `20261103000001` or `20261105000001`, its contents can be executed independently in the Supabase Dashboard SQL Editor (`https://supabase.com/dashboard/project/gmtlwewpblnnkzuwfcib/sql`) if the project owner wishes to deploy **only** cancellation first.

---

### Pre-Deployment Verification Query
Execute in read-only mode to verify all schema prerequisites exist:
```sql
SELECT 
    column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'orders' 
  AND column_name IN (
    'id', 'receipt_token_hash', 'customer_id', 
    'status', 'order_number', 'refund_status', 
    'rejection_reason', 'version', 'updated_at'
  );
-- Expected: Exactly 9 rows returned.
```

### Post-Deployment Verification Query
Execute immediately following deployment:
```sql
SELECT 
    routine_name, 
    routine_type, 
    security_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'cancel_order_by_customer';
-- Expected: Exactly 1 row with routine_type = 'FUNCTION' and security_type = 'DEFINER'.
```

### Rollback Plan
If rollback is ever necessary, the function can be removed instantaneously with zero data loss:
```sql
DROP FUNCTION IF EXISTS public.cancel_order_by_customer(UUID, TEXT, TEXT);
```

---

## 7. Review Verdict & Next Steps

### Verdict
# **SAFE FOR STAGING DEPLOYMENT**

- **Data Loss Risk**: **NONE (0%)**
- **Security Vulnerabilities**: **NONE DETECTED**
- **Schema Conflicts**: **NONE DETECTED**
- **Idempotency**: **VERIFIED**
- **Dependency Compatibility**: **100% SATISFIED**

---
*End of Safety Review Report. Awaiting explicit user authorization before performing any deployment actions.*

