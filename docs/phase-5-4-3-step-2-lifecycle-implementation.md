# AY PIZZA & ICE CREAM — PHASE 5.4.3 / STEP 2
## Order Lifecycle Alignment & Transit Tracking Implementation

**Project:** AY Pizza & Ice Cream Customer Mobile Application (`ng.aypizza.app`)  
**Phase:** 5.4.3 — Step 2  
**Date:** November 2026  
**Status:** Implementation Complete & Validated (494/494 Tests Passing)

---

## 1. Executive Summary

Step 2 of Phase 5.4.3 addresses the architectural discrepancy between the backend order lifecycle and customer-facing delivery tracking. Prior to this milestone, customer delivery tracking lacked dedicated transit timestamping (`in_transit_at`) and kitchen/counter dispatch transitions did not formally differentiate counter pickup handovers from motorcycle courier dispatches.

This implementation delivers:
1. A forward-only PostgreSQL schema migration adding `in_transit_at TIMESTAMPTZ` with an index for courier performance queries.
2. Backfilled historical dispatch timestamps derived from immutable audit events (`order_status_events`).
3. Hardened `transition_order_status` RPC enforcing divergent lifecycles (Pickup: 5 stages vs Delivery: 6 stages) and role-based staff authorization.
4. Hardened customer `get_order_by_receipt` RPC returning authoritative timestamps (`in_transit_at`, `accepted_at`, `prepared_at`, `ready_at`, `completed_at`).
5. Hardened kitchen display system `get_kds_orders` RPC returning `inTransitAt`.
6. Updated TypeScript domain models and normalization services mapping `inTransitAt` cleanly.

---

## 2. Database Schema Migration

### 2.1 Forward-Only Migration File
- **Path:** `supabase/migrations/20261105000001_phase5_4_3_order_transit_tracking.sql`

```sql
-- 1. ADD in_transit_at COLUMN TO public.orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS in_transit_at TIMESTAMPTZ;

-- Performance index for courier queries
CREATE INDEX IF NOT EXISTS idx_orders_in_transit_at 
    ON public.orders (in_transit_at) 
    WHERE in_transit_at IS NOT NULL;

-- 2. BACKFILL HISTORICAL in_transit_at TIMESTAMPTZ FROM AUDIT EVENTS
UPDATE public.orders o
SET in_transit_at = sub.transit_time
FROM (
    SELECT order_id, MIN(created_at) AS transit_time
    FROM public.order_status_events
    WHERE new_status = 'IN_TRANSIT'
    GROUP BY order_id
) sub
WHERE o.id = sub.order_id AND o.in_transit_at IS NULL;
```

---

## 3. RPC Hardening & State Machine Divergence

### 3.1 Divergent State Machine Rules

The state transition logic in `transition_order_status` enforces strict workflow branching based on `fulfillment_type`:

| Current Status | Target Status | Fulfillment Type | Allowed? | Rationale / Behavior |
| :--- | :--- | :--- | :---: | :--- |
| `CONFIRMED` | `ACCEPTED` | Both | **YES** | Kitchen/Counter acknowledges ticket. |
| `CONFIRMED` | `CANCELLED` | Both | **YES** | Store rejects/cancels ticket; reason required; refund flagged. |
| `ACCEPTED` | `PREPARING` | Both | **YES** | Pizza enters oven baking stage. |
| `PREPARING` | `READY_FOR_PICKUP` | Both | **YES** | Food boxed; ready at counter or dispatch shelf. |
| `READY_FOR_PICKUP` | `DELIVERED` | **Pickup** | **YES** | Customer collects hot box at King Jaja Hall stand. |
| `READY_FOR_PICKUP` | `IN_TRANSIT` | **Pickup** | **BLOCKED** | Pickups never enter courier transit. |
| `READY_FOR_PICKUP` | `IN_TRANSIT` | **Delivery** | **YES** | Courier collects order; sets `in_transit_at = v_now`. |
| `READY_FOR_PICKUP` | `DELIVERED` | **Delivery** | **BLOCKED** | Cannot bypass dispatch; must transition to `IN_TRANSIT` first. |
| `IN_TRANSIT` | `DELIVERED` | **Delivery** | **YES** | Courier arrives at customer landmark; sets `completed_at = v_now`. |
| Any active state | `CANCELLED` | Both | **YES** | Sets `rejection_reason` and sets `refund_status = 'REFUND_REQUIRED'`. |

### 3.2 Granular Staff Role Enforcement
- **Kitchen Staff (`role = 'kitchen'`):**
  - CAN transition `ACCEPTED` $\rightarrow$ `PREPARING` $\rightarrow$ `READY_FOR_PICKUP`.
  - CANNOT cancel/reject orders (`CANCELLED`). Counter/Manager authority required.
  - CANNOT dispatch orders (`IN_TRANSIT`) or complete handover (`DELIVERED`).
- **Counter Staff (`role = 'counter'`):**
  - CAN accept incoming orders (`CONFIRMED` $\rightarrow$ `ACCEPTED`).
  - CANNOT trigger oven preparation (`PREPARING`).
  - CAN hand over pickup orders (`READY_FOR_PICKUP` $\rightarrow$ `DELIVERED`).
  - CAN dispatch delivery orders to riders (`READY_FOR_PICKUP` $\rightarrow$ `IN_TRANSIT`).
- **Manager / Admin (`role IN ('manager', 'admin')`):**
  - Unrestricted operational transition authority.

---

## 4. TypeScript Client Synchronization

### 4.1 Order Interface (`src/types/order.ts`)
```typescript
export interface Order {
  // ...
  acceptedAt?: string | null;
  preparedAt?: string | null;
  readyAt?: string | null;
  inTransitAt?: string | null; // Phase 5.4.3
  completedAt?: string | null;
  // ...
}
```

### 4.2 Database Types (`src/types/database.ts`)
Added `in_transit_at?: string | null` to `orders` table `Row`, `Insert`, and `Update` interfaces.

### 4.3 Normalization Service (`src/domains/order/order-service.ts`)
Updated `normalizeOrder`:
```typescript
inTransitAt: raw.in_transit_at || raw.inTransitAt || null,
```

---

## 5. Security & Isolation Verification

1. **Defensive Search Path:** Both `transition_order_status` and `get_order_by_receipt` enforce `SET search_path = public, auth, pg_temp` to prevent search path hijacking.
2. **Execution Permissions:**
   - `transition_order_status`: Revoked from `PUBLIC` and `anon`. Granted strictly to `authenticated` and `service_role`.
   - `get_order_by_receipt`: Open to `anon` and `authenticated` but strictly gated by SHA-256 receipt token verification (`digest(TRIM(p_receipt_token), 'sha256')`).
   - `get_kds_orders`: Revoked from `PUBLIC` and `anon`. Granted strictly to `authenticated` staff.
3. **Optimistic Locking:** Version increments (`version = v_order.version + 1`) and row locks (`FOR UPDATE`) prevent race conditions between kitchen staff and counter dispatchers.

---

## 6. Verification Status

- **Automated Tests:** 27/27 tests passed in `src/__tests__/phase5-4-3-steps2-and-3-tracking.test.ts`.
- **Full Suite:** 34 test suites, 494 tests passing.
- **TypeScript:** 0 compilation errors (`npx tsc --noEmit`).
- **Expo Doctor:** 20/20 checks passed.

