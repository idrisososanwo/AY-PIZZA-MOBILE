# Phase 4.2 Implementation & Verification Report — Customer Order Tracking & Push Notifications

**Project:** AY Pizza Production-Ready Customer Mobile Application  
**Target Location:** Opposite King Jaja Hall, University of Lagos, Akoka, Lagos, Nigeria  
**Phase:** 4.2 — Customer Order Tracking & Push Notifications  
**Author:** AI Senior Lead Engineer & Mobile Architect  
**Date:** October 22, 2026  
**Status:** Complete — All Features Implemented, Typechecked & Regression Verified  

---

## 1. Implemented Architecture Overview

Phase 4.2 delivers a production-grade customer order-tracking experience and a reliable, asynchronous server-side push notification pipeline. The system seamlessly integrates with the existing Phase 3 payments and Phase 4.1 Kitchen Display System without altering core business rules or bypassing database security.

### Key Architectural Pillars:
1. **Authoritative Order State Machine:** Status transitions remain driven exclusively by PostgreSQL functions (`settle_order_payment` and `transition_order_status`). No client can declare or modify order status.
2. **Customer-Friendly Tracking:** Live status presentation maps internal enums to clear customer copy, maintaining strict operational distinctions between counter pickup (no transit milestone) and delivery (in-transit milestone).
3. **Append-Only Event Ledger:** Status changes automatically generate immutable entries in `public.order_status_events`, providing a verifiable timeline.
4. **Supabase Realtime with Monotonic Version Guards:** Realtime events on `orders:id=eq.${orderId}` are evaluated against monotonic `version` counters; stale or out-of-order events are dropped, and authoritative data is re-fetched.
5. **Atomic Notification Outbox Pattern:** Outbox rows in `public.notification_outbox` are enqueued atomically within the status transition transaction, ensuring zero missed or orphaned notifications.
6. **Server-Side Edge Function Processor:** `push-processor` claims outbox jobs using `FOR UPDATE SKIP LOCKED` concurrency locks, sends high-priority notifications via the Expo Push API, and applies exponential backoff for transient failures.
7. **Device Push Token Lifecycle:** `device_push_tokens` manages active device tokens, deactivates tokens upon user logout, and automatically purges invalidated tokens (`DeviceNotRegistered`).

---

## 2. Database Changes & Schema Extensions

Migration file: [`supabase/migrations/20261022000008_phase4_2_tracking_and_notifications.sql`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261022000008_phase4_2_tracking_and_notifications.sql)

### 2.1 Table: `public.order_status_events`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE`
- `previous_status public.order_status`
- `new_status public.order_status NOT NULL`
- `version INT NOT NULL`
- `actor_type TEXT NOT NULL DEFAULT 'system'`
- `actor_id TEXT`
- `title TEXT NOT NULL`
- `description TEXT NOT NULL`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`
- **Integrity Trigger:** `trg_prevent_order_event_modification` rejects `UPDATE` or `DELETE` operations, guaranteeing strict immutability.
- **Indexes:** `idx_order_status_events_order_time (order_id, created_at ASC)`.

### 2.2 Table: `public.device_push_tokens`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE`
- `guest_device_id TEXT` (Anonymous device UUID for guest checkout devices)
- `push_token TEXT NOT NULL UNIQUE`
- `platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web'))`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`
- `last_used_at TIMESTAMPTZ`
- `revocation_reason TEXT`
- **Indexes:** `(user_id, is_active)`, `(guest_device_id, is_active)`, `(push_token)`.

### 2.3 Table: `public.notification_outbox`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE`
- `user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL`
- `event_type TEXT NOT NULL`
- `target_token TEXT NOT NULL`
- `title TEXT NOT NULL`
- `body TEXT NOT NULL`
- `data JSONB NOT NULL DEFAULT '{}'::jsonb`
- `status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter'))`
- `attempt_count INT NOT NULL DEFAULT 0`
- `next_retry_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`
- `last_error TEXT`
- `idempotency_key TEXT NOT NULL UNIQUE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`
- `processed_at TIMESTAMPTZ`
- **Indexes:** `(status, next_retry_at)` for fast queue polling; `(order_id)`.

### 2.4 RPCs and Triggers
1. **`trg_order_status_transition` on `public.orders`:**
   Fires `AFTER UPDATE OF status ON public.orders WHEN (OLD.status IS DISTINCT FROM NEW.status)`.
   Atomically inserts an immutable `order_status_events` row and enqueues idempotent rows in `notification_outbox` for all active customer/device tokens.
2. **`register_device_push_token(p_push_token, p_platform, p_guest_device_id)`:**
   `SECURITY DEFINER SET search_path = public, pg_temp;`
   Upserts token into `device_push_tokens`, associating with `auth.uid()` or guest device ID.
3. **`deactivate_device_push_token(p_push_token, p_reason)`:**
   `SECURITY DEFINER SET search_path = public, pg_temp;`
   Deactivates device token upon logout, preventing notification leaks.
4. **`claim_notification_jobs(p_batch_size)`:**
   `SECURITY DEFINER SET search_path = public, pg_temp;`
   Atomically claims pending/retryable jobs using `FOR UPDATE SKIP LOCKED`. Restricted to `service_role`.
5. **`finalize_notification_job(p_job_id, p_success, p_error, p_is_unregistered)`:**
   `SECURITY DEFINER SET search_path = public, pg_temp;`
   Updates outbox job to `'sent'`, applies exponential backoff on transient failure, or dead-letters on max retries / `DeviceNotRegistered`. Restricted to `service_role`.
6. **Enriched `get_order_by_receipt(p_order_id, p_receipt_token)`:**
   Updated to return `version`, `refund_status`, `rejection_reason`, contextual fulfillment timestamps, and the full array of `events`.

---

## 3. RLS and Permission Model

| Table | Select Policy | Insert Policy | Update/Delete Policy |
| :--- | :--- | :--- | :--- |
| `order_status_events` | Authenticated owner (`o.customer_id = auth.uid()`) OR staff/admin | Denied (`WITH CHECK (false)`) | Denied (Immutable trigger) |
| `device_push_tokens` | Authenticated owner (`user_id = auth.uid()`) OR staff/admin | Denied (Use RPC `register_device_push_token`) | Owner only (deactivation) |
| `notification_outbox` | Denied to clients (Service-role only) | Denied (Database trigger only) | Denied (Service-role RPC only) |

---

## 4. Realtime Order Tracking Architecture

- **Channel:** Subscribes to `postgres_changes` on `public.orders` filtered by `id=eq.${orderId}`.
- **Monotonic Version Validation:** Incoming payload `version` is compared against current cached `version`. If `incoming.version <= cached.version`, the event is dropped.
- **Authoritative Re-Fetch:** Realtime events act as signals. An authorized call to `orderService.getOrderReceipt(orderId, receiptToken)` is triggered to fetch validated server data.
- **Resilience & Polling Fallback:** In addition to Realtime WebSocket listeners, a 10-second polling interval guarantees update delivery across unstable campus Wi-Fi/cellular networks near King Jaja Hall.
- **Lifecycle Cleanup:** Unsubscribes and clears intervals on modal close or component unmount.

---

## 5. Push Notification Outbox & Expo Dispatch Flow

1. **Trigger:** `transition_order_status()` or `settle_order_payment()` executes a status update on `public.orders`.
2. **Atomic Outbox Insert:** Trigger inserts job into `notification_outbox` with unique idempotency key:
   `${order_id}:${new_status}:${push_token}`.
3. **Server Worker:** Supabase Edge Function `push-processor` is invoked via CRON or webhook.
4. **Concurrency Lock:** Calls `claim_notification_jobs()`, executing `SELECT ... FOR UPDATE SKIP LOCKED` to prevent concurrent worker double-sends.
5. **Expo Push API:** Submits batches of messages to `https://exp.host/--/api/v2/push/send`.
6. **Receipt Processing:**
   - Status `ok`: Marks outbox `status = 'sent'`.
   - Error `DeviceNotRegistered`: Sets token `is_active = false` in `device_push_tokens` and moves outbox job to `dead_letter`.
   - Transient network error: Schedules retry with exponential backoff: `15 * 2^(attempt - 1)` seconds (15s, 30s, 60s, 120s...). Max 5 attempts before `dead_letter`.

---

## 6. Device Token Management

Implemented in [`src/domains/notifications/notification-service.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/domains/notifications/notification-service.ts):
- **Respectful Permission Flow:** Does not display native prompt on launch. Explanatory banner explains benefits inside the tracking modal before requesting system permissions.
- **Cross-Platform Fallback:** Safely resolves to `unsupported` on web and simulators without throwing unhandled exceptions.
- **Logout Invalidation:** `deactivateCurrentToken()` calls database RPC and purges local storage upon account sign-out.

---

## 7. Customer Tracking Experience (Pickup vs Delivery)

Implemented in [`src/components/OrderTrackingModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/OrderTrackingModal.tsx):
- **Pickup Milestones:**  
  1. `Confirmed` (Payment verified)  
  2. `Accepted` (Kitchen accepted)  
  3. `Baking` (In pizza oven)  
  4. `Ready` (Hot at counter, Opposite King Jaja Hall)  
  5. `Collected` (Order picked up)  
  *(Note: `IN_TRANSIT` is strictly excluded from pickup workflows).*
- **Delivery Milestones:**  
  1. `Confirmed` (Payment verified)  
  2. `Accepted` (Kitchen accepted)  
  3. `Baking` (In pizza oven)  
  4. `Packed` (Packaged for courier dispatch)  
  5. `On Way` (Courier in transit to UNILAG landmark)  
  6. `Delivered` (Confirmed delivery at landmark)
- **Cancelled Orders:** Prominently highlights cancellation reason and refund status review notice.

---

## 8. Verification Results

### 8.1 Automated Unit & Integration Tests
```text
> npm test
Test Suites: 18 passed, 18 total
Tests:       226 passed, 226 total (including 12 new Phase 4.2 tests)
Snapshots:   0 total
Time:        25.337 s
```

### 8.2 TypeScript Compilation
```bash
npx tsc --noEmit
# Exit code: 0 (Zero type errors)
```

### 8.3 Expo Doctor Diagnostic
```bash
npx expo-doctor
# 20/20 checks passed. No issues detected!
```

---

## 9. Known Limitations & Production Readiness

| Category | Item | Description | Status |
| :--- | :--- | :--- | :--- |
| **Accepted Limitation** | No Live GPS | Riders are dispatched to landmarks manually; no simulated map tracking is provided. | By Design |
| **Production Dependency** | Expo Push Credentials | Physical device notifications in production require EAS Project ID and Apple/Google push credentials. | Documented |
| **Production Dependency** | Supabase PG_CRON | Calling `push-processor` every minute requires enabling `pg_cron` or an external scheduled trigger. | Documented |
| **Test Environment** | Expo Push Sandbox | Unit tests mock Expo Push API calls; physical device delivery is not verified locally. | Transparently Documented |
