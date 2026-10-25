# Phase 4.2 Architecture Specification — Customer Order Tracking & Push Notifications

**Project:** AY Pizza Production Mobile Application  
**Target Location:** Opposite King Jaja Hall, University of Lagos, Akoka, Lagos, Nigeria  
**Phase:** 4.2 — Customer Order Tracking & Push Notifications  
**Date:** October 22, 2026  
**Status:** Architecture Documented — Proceeding with Implementation  

---

## 1. Codebase Inspection & Baseline Analysis

Before introducing code changes, a comprehensive inspection was conducted across the AY Pizza codebase, including completed Phase 3 and Phase 4.1 security migrations:

### 1.1 Order Schema & Concurrency Versioning
- **Table:** `public.orders` contains `id`, `order_number`, `customer_id`, `fulfillment_type`, `status`, `payment_reference`, `idempotency_key`, `created_at`, `updated_at`.
- **Concurrency Version:** `orders.version` (integer counter) was established in Phase 4.1.1 (`20261022000006_phase4_1_1_adversarial_hardening.sql`). It starts at `1` and is monotonically incremented on every status transition (`version = v_order.version + 1`).
- **Timestamps:** Contextual fulfillment timestamps exist: `accepted_at`, `prepared_at`, `ready_at`, `completed_at`.
- **Refund Status:** `orders.refund_status` tracks `'NONE'`, `'REFUND_REQUIRED'`, and `'REFUNDED'`.

### 1.2 Status Enum & Fulfillment State Machine
- **Enum:** `public.order_status` values:
  `DRAFT`, `PENDING_PAYMENT`, `PAID`, `CONFIRMED`, `ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED`, `REFUNDED`.
- **Fulfillment Separation:**
  - **Pickup Orders:**  
    `CONFIRMED` → `ACCEPTED` → `PREPARING` → `READY_FOR_PICKUP` → `DELIVERED` (handoff at UNILAG counter).  
    *Constraint:* `IN_TRANSIT` is strictly excluded from pickup workflows. The UI must never display a transit milestone for pickup orders.
  - **Delivery Orders:**  
    `CONFIRMED` → `ACCEPTED` → `PREPARING` → `READY_FOR_PICKUP` (packaged for courier) → `IN_TRANSIT` (dispatched to courier) → `DELIVERED` (confirmed delivery at UNILAG landmark).
  - **Terminal States:** `DELIVERED` and `CANCELLED`.

### 1.3 Transition Functions & Security Definer Hardening
- `public.settle_order_payment()`: Settles Paystack transactions and advances status from `PENDING_PAYMENT` to `CONFIRMED`.
- `public.transition_order_status()`: Hardened in Phase 4.1.3 (`20261022000007_phase4_1_3_search_path_hardening.sql`) with explicit `SET search_path = public, pg_temp;` and revoked public schema creation. It enforces staff role verification, concurrency locks via `p_expected_current_status`, and records immutable entries in `public.audit_logs`.

### 1.4 Customer & Guest Order Recovery
- **Guest Orders:** Authenticated via 256-bit unguessable receipt tokens stored in hardware-backed Expo SecureStore (`GuestReceiptStore`).
- **Retrieval RPC:** `public.get_order_by_receipt(p_order_id, p_receipt_token)` matches against `orders.receipt_token_hash` via SHA-256. It is accessible to `anon` and `authenticated` roles without leaking secret token hashes.

### 1.5 Historical Order Events Gap
- Inspection identified that `public.audit_logs` is restricted to `admin` (`CREATE POLICY "Admin view audit logs" ... USING (is_admin())`).
- There is currently no customer-accessible order event history table.
- **Decision:** Implement `public.order_status_events` as an append-only timeline table populated atomically on status transitions.

---

## 2. Customer Order Tracking Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Customer Tracking Screen                    │
│  - Order Number & Date                                      │
│  - Live Status Progression Bar (Pickup vs Delivery)         │
│  - Itemized Summary (Pizzas, Toppings, Crust, Quantities)  │
│  - Landmark / Pickup Counter Information                    │
│  - Append-Only Event Timeline with Localized Timestamps     │
└──────────────┬──────────────────────────────▲───────────────┘
               │                              │
         Re-fetch on                    Realtime Event
      Reconnect / Disconnect            (orders:id=eq.X)
               │                              │
┌──────────────▼──────────────────────────────┴───────────────┐
│                    Order Tracking Service                   │
│  - Supabase Realtime Channel Subscription                   │
│  - Monotonic Version Guard: Drop event if version <= cached │
│  - Guest Receipt Authorization: SecureStore Token           │
│  - Authenticated Customer Authorization: auth.uid()         │
│  - Secure Fallback Polling (10s interval when disconnected) │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Customer-Facing Status Presentation Mapping
| Database Status | Pickup Order Customer Title | Delivery Order Customer Title | Description |
| :--- | :--- | :--- | :--- |
| `CONFIRMED` | Order Confirmed | Order Confirmed | Payment verified. Sent to kitchen queue. |
| `ACCEPTED` | Order Accepted | Order Accepted | AY Pizza kitchen has accepted your order. |
| `PREPARING` | Pizza in Oven | Pizza in Oven | Fresh dough stretched and baking in kitchen. |
| `READY_FOR_PICKUP` | Ready for Pickup | Order Packed | Ready at AY Pizza counter (King Jaja Hall) / Awaiting dispatch. |
| `IN_TRANSIT` | *N/A (Omitted)* | On the Way | Rider dispatched to your UNILAG landmark. |
| `DELIVERED` | Order Collected | Order Delivered | Handed over successfully. Enjoy your pizza! |
| `CANCELLED` | Order Cancelled | Order Cancelled | Order cancelled. (Reason & refund status displayed). |

### 2.2 Realtime Subscription & Concurrency Guard
1. **Subscription Channel:** `supabase.channel('order_tracking:${orderId}')` listening to `postgres_changes` on `orders` with filter `id=eq.${orderId}`.
2. **Version Check:** Every status update contains `version`. If `incoming.version <= current.version`, the event is dropped as stale or duplicate.
3. **Authoritative Re-Fetch:** Realtime payloads trigger an authoritative query to `get_order_by_receipt()` or customer orders query to fetch verified database fields.
4. **Lifecycle Cleanup:** Unsubscribes from the channel on component unmount or modal close.
5. **Reconnection Resiliency:** On network reconnect, automatically executes an authoritative re-fetch to capture any milestones missed while offline.

---

## 3. Push Notification Outbox & Processing Architecture

```
  Authoritative Order Transition
 (transition_order_status / settle_order_payment)
               │
               ▼ (Atomic DB Transaction)
┌─────────────────────────────────────────────────────────────┐
│ PostgreSQL Database                                         │
│  ├── public.orders (status updated, version incremented)    │
│  ├── public.order_status_events (append-only timeline)      │
│  └── public.notification_outbox (idempotent notification job)│
└──────────────────────────────┬──────────────────────────────┘
                               │
                Polled / Triggered Processing
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Edge Function / Server Worker (`push-processor`)            │
│  1. Atomic Claim: SELECT ... FOR UPDATE SKIP LOCKED         │
│  2. Format minimal payload (no PII, no tokens, no secrets)  │
│  3. POST https://exp.host/--/api/v2/push/send              │
│  4. Handle Tickets / Receipts:                              │
│     - Success: Mark outbox status = 'sent'                  │
│     - DeviceNotRegistered: Invalidate device_push_tokens   │
│     - Transient Error: Increment attempts, backoff retry    │
│     - Max Attempts Exceeded: Move to 'dead_letter'          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
               Expo Push Service → Customer Device
```

### 3.1 PostgreSQL Notification Outbox Table (`public.notification_outbox`)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE`
- `user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL`
- `event_type TEXT NOT NULL`
- `target_token TEXT NOT NULL`
- `title TEXT NOT NULL`
- `body TEXT NOT NULL`
- `data JSONB NOT NULL DEFAULT '{}'::jsonb`
- `status TEXT NOT NULL DEFAULT 'pending'` (`pending`, `processing`, `sent`, `failed`, `dead_letter`)
- `attempt_count INT NOT NULL DEFAULT 0`
- `next_retry_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`
- `last_error TEXT`
- `idempotency_key TEXT NOT NULL UNIQUE` (Prevents duplicate notifications: `order_id:status:token`)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`
- `processed_at TIMESTAMPTZ`

### 3.2 Device Token Table (`public.device_push_tokens`)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE`
- `guest_device_id TEXT` (Anonymous device identifier for guest notifications)
- `push_token TEXT NOT NULL UNIQUE`
- `platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web'))`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`
- `last_used_at TIMESTAMPTZ`
- `revocation_reason TEXT`

### 3.3 Security Principles for Notifications
- **Payload Minimality:** Payloads contain only Title, Body, `orderId`, and navigation route. **NEVER** include customer phone numbers, delivery addresses, payment references, receipt tokens, or secrets.
- **Client Privilege Isolation:** Clients cannot insert into `notification_outbox` or update its delivery status. Only database triggers or trusted SECURITY DEFINER functions write to the outbox.
- **Token Isolation:** RLS ensures customers can only insert, view, or deactivate their own push tokens.
- **Account Switching:** When a user logs out, their active device token is deactivated to prevent notifications leaking to subsequent users on the same device.

---

## 4. Identified Limitations & Operational Boundaries

1. **Manual Dispatch & Delivery Confirmation:** AY Pizza does not have GPS tracking or simulated rider movement. In-transit and delivered transitions rely on staff operational actions (counter handover / courier dispatch).
2. **Guest Push Notifications:** Push notifications for guest orders require a valid device push token registered with a guest device ID. If the guest denies notification permissions, the application seamlessly falls back to Realtime updates and periodic polling.
3. **Expo Push API Sandbox:** In development environments without physical Android/iOS devices (e.g. web exports or simulators), push token registration safely resolves to a mock/dry-run state without crashing.
