# PHASE 4.2.1 — ADVERSARIAL SECURITY, RELIABILITY & INTEGRATION REVIEW

**Project:** AY Pizza Production-Ready Customer Mobile Application  
**Target Business:** AY Pizza, Opposite King Jaja Hall, University of Lagos, Akoka, Lagos, Nigeria  
**Scope:** Phase 4.2 Customer Order Tracking & Push Notifications  
**Audit Conducted By:** Independent Senior Security & Mobile Architecture Reviewer  
**Audit Date:** October 2026  
**Final Verdict:** **CONDITIONALLY ACCEPTED** (All confirmed defects resolved and verified locally; named staging database migration and production APNs/FCM receipt verification required prior to store release).

---

## 1. Executive Summary & Audit Overview

This adversarial review independently audited the Phase 4.2 Customer Order Tracking and Push Notification implementation across PostgreSQL migrations, database functions, RLS policies, the Supabase Edge Function (`push-processor`), client domain services, and UI components.

Rather than validating the previous developer's claims, this review traced the execution lifecycle from database order state transitions, trigger enqueueing, atomic outbox claims with bounded leases, Expo ticket submissions, asynchronous receipt polling, and device token lifecycles, down to the customer device display.

Seven distinct vulnerabilities and defects were identified, analyzed, and corrected. A new corrective migration ([`20261022000009_phase4_2_1_adversarial_hardening.sql`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261022000009_phase4_2_1_adversarial_hardening.sql)) was authored, server-side Edge Function code was hardened, and client tracking services were refactored to enforce strict guest polling isolation and terminal state cleanup.

All 19 test suites comprising 248 tests pass with 0 failures, TypeScript compiles with 0 errors, Expo Doctor reports 20/20 checks passing, and production bundles for Web and Android (Hermes bytecode) build cleanly.

---

## 2. Issues Investigated & Defect Inventory

| Defect ID | Severity | Category | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-42-01** | **CRITICAL** | Authorization / Edge Function | Push-processor Edge Function permitted unauthenticated HTTP invocations when `Authorization` header was absent | **CONFIRMED & FIXED** |
| **DEF-42-02** | **HIGH** | Reliability / Distributed State | Notification outbox lacked lease timeout; crashed/timed-out workers left claimed jobs permanently in `processing` | **CONFIRMED & FIXED** |
| **DEF-42-03** | **HIGH** | Security / Token Ownership | Anonymous callers could overwrite existing push token ownership in `device_push_tokens`, disassociating authenticated users | **CONFIRMED & FIXED** |
| **DEF-42-04** | **HIGH** | Reliability / Push Delivery | Outbox discarded Expo `ticket_id`; no receipt polling on `/--/api/v2/push/getReceipts`; asynchronous APNs/FCM errors unhandled | **CONFIRMED & FIXED** |
| **DEF-42-05** | **MEDIUM** | Security / Realtime Scoping | Unauthenticated guests opened WebSocket Realtime channels on `public.orders` that were blocked by RLS | **CONFIRMED & FIXED** |
| **DEF-42-06** | **MEDIUM** | Performance / Resource Leak | Customer tracking modal ran continuous 10s polling indefinitely even after orders reached `DELIVERED` or `CANCELLED` | **CONFIRMED & FIXED** |
| **DEF-42-07** | **LOW** | Security / Database Search Path | Immutability trigger function `reject_order_event_tampering()` lacked explicit `search_path` configuration | **CONFIRMED & FIXED** |

---

## 3. Detailed Investigation & Resolution of Confirmed Defects

### DEF-42-01 (CRITICAL): Edge Function Push Processor Authorization Bypass
- **Investigation:** In [`supabase/functions/push-processor/index.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/functions/push-processor/index.ts), caller authentication was guarded by `if (authHeader && !authHeader.includes(...))`. If an HTTP request was sent with **no `Authorization` header at all**, `authHeader` evaluated to an empty string, completely bypassing the guard. Any public actor on the internet could invoke the function, trigger push broadcasts, and consume Expo rate limits.
- **Correction:** Enforced mandatory Bearer token validation at the entry of the request handler:
  ```ts
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or malformed Authorization header.' }), { status: 401 });
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const isAuthorized = token === supabaseServiceKey || (cronSecret && token === cronSecret);
  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized invocation.' }), { status: 401 });
  }
  ```
- **Files Modified:** [`supabase/functions/push-processor/index.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/functions/push-processor/index.ts).

---

### DEF-42-02 (HIGH): Outbox Job Deadlock on Worker Crash or Timeout
- **Investigation:** In migration `20261022000008`, `claim_notification_jobs` set `status = 'processing'` and only claimed jobs `WHERE status IN ('pending', 'failed')`. If an Edge Function worker crashed, ran out of memory, or timed out during the external HTTP dispatch to Expo, those jobs remained in `processing` status indefinitely with no recovery mechanism.
- **Correction:**
  1. Added `lease_expires_at TIMESTAMPTZ` column and index on `public.notification_outbox(status, lease_expires_at) WHERE status = 'processing'`.
  2. Updated `claim_notification_jobs(INT, INT)` to assign a bounded 5-minute lease (`now() + p_lease_seconds * interval '1 second'`).
  3. Included crashed worker recovery in the claim predicate:
     ```sql
     (n.status = 'processing' AND n.lease_expires_at IS NOT NULL AND n.lease_expires_at < v_now)
     ```
- **Files Modified:** [`supabase/migrations/20261022000009_phase4_2_1_adversarial_hardening.sql`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261022000009_phase4_2_1_adversarial_hardening.sql).

---

### DEF-42-03 (HIGH): Token Hijacking and Anonymous Disassociation
- **Investigation:** In `register_device_push_token`, an `ON CONFLICT (push_token) DO UPDATE` was executed blindly. An anonymous caller supplying a valid token string could set `user_id = NULL` and `guest_device_id = ...`, disassociating a customer's authenticated device from their user profile and cutting off their order milestone notifications.
- **Correction:** Hardened `register_device_push_token` with an explicit ownership defense:
  ```sql
  IF v_existing.user_id IS NOT NULL AND v_caller_id IS NULL THEN
      RETURN jsonb_build_object(
          'success', false, 
          'error', 'Unauthorized: Existing token belongs to an authenticated user.'
      );
  END IF;
  ```
  Additionally, integrated server token deactivation in [`src/domains/auth/auth-service.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/domains/auth/auth-service.ts) upon `signOutUser()` to prevent notification crossover across shared physical devices.
- **Files Modified:** [`supabase/migrations/20261022000009_phase4_2_1_adversarial_hardening.sql`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261022000009_phase4_2_1_adversarial_hardening.sql), [`src/domains/auth/auth-service.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/domains/auth/auth-service.ts).

---

### DEF-42-04 (HIGH): Missing Push Receipt Verification & Unregistered Token Handling
- **Investigation:** Expo Push delivery consists of two distinct stages: (1) Ticket Submission, and (2) Asynchronous Receipt Retrieval. A ticket with `status: "ok"` only confirms receipt by Expo servers, not delivery to Apple APNs or Google FCM. Fatal device-level errors (such as `DeviceNotRegistered` when an app is uninstalled) are returned asynchronously via `https://exp.host/--/api/v2/push/getReceipts`. The Phase 4.2 implementation discarded `ticket.id` and did not verify receipts.
- **Correction:**
  1. Added `ticket_id TEXT`, `receipt_checked_at TIMESTAMPTZ`, and `receipt_status TEXT` to `public.notification_outbox`.
  2. Updated `finalize_notification_job` to accept and record `p_ticket_id`.
  3. Added RPCs `get_unverified_notification_tickets(INT)` and `process_push_receipts(JSONB)` in migration `20261022000009`.
  4. Updated `push-processor/index.ts` to query unverified tickets, poll the Expo receipts endpoint, and deactivate any tokens returning `DeviceNotRegistered`.
- **Files Modified:** [`supabase/migrations/20261022000009_phase4_2_1_adversarial_hardening.sql`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261022000009_phase4_2_1_adversarial_hardening.sql), [`supabase/functions/push-processor/index.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/functions/push-processor/index.ts).

---

### DEF-42-05 (MEDIUM): Realtime Scoping & Guest Polling Isolation
- **Investigation:** Supabase Realtime uses PostgreSQL row-level security (RLS) on Postgres WAL CDC events. The policy on `public.orders` strictly restricts SELECTs to authenticated owners (`customer_id = auth.uid()`) or staff. Unauthenticated guests have no JWT session, so PostgreSQL RLS suppresses all row changes for them. Subscribing guests to a WebSocket channel resulted in a dead connection showing "LIVE" while never receiving push messages.
- **Correction:** In [`src/domains/order/order-tracking-service.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/domains/order/order-tracking-service.ts), added session verification upon authoritative order receipt retrieval. If the order is unowned by the active session (guest order), the Realtime channel is torn down, and the client tracks strictly via authenticated `getOrderReceipt()` receipt-token polling. In [`src/components/OrderTrackingModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/OrderTrackingModal.tsx), the status indicator accurately displays `SYNC` for polling and `LIVE` for authenticated Realtime.
- **Files Modified:** [`src/domains/order/order-tracking-service.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/domains/order/order-tracking-service.ts), [`src/components/OrderTrackingModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/OrderTrackingModal.tsx).

---

### DEF-42-06 (MEDIUM): Unconditional Polling & Terminal State Resource Leaks
- **Investigation:** When an order completed or was cancelled (`DELIVERED` or `CANCELLED`), the 10-second polling interval in `order-tracking-service.ts` continued executing indefinitely, creating unnecessary database load.
- **Correction:** In `order-tracking-service.ts`, when an incoming order version indicates `DELIVERED` or `CANCELLED`, `cleanupResources()` is immediately invoked: `clearInterval(pollIntervalId)` is executed, and `supabase.removeChannel(realtimeChannel)` is called. The state enters `trackingMode: 'terminal'`.
- **Files Modified:** [`src/domains/order/order-tracking-service.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/domains/order/order-tracking-service.ts).

---

### DEF-42-07 (LOW): Search Path Hardening on Immutability Trigger
- **Investigation:** The trigger function `reject_order_event_tampering()` in `20261022000008` was defined without an explicit `SET search_path = public, pg_temp;`.
- **Correction:** Added `SECURITY DEFINER` and `SET search_path = public, pg_temp;` in migration `20261022000009`.
- **Files Modified:** [`supabase/migrations/20261022000009_phase4_2_1_adversarial_hardening.sql`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261022000009_phase4_2_1_adversarial_hardening.sql).

---

## 4. Issues Investigated but Not Reproduced

1. **Receipt Token Guessing / Enumeration:** Investigated whether an attacker could enumerate order receipts by cycling tokens. **Not reproduced.** Tokens are generated using `gen_random_bytes(32)` (256 bits of cryptographic entropy) and hashed with SHA-256 before storage.
2. **Event History Tampering via Client RPC:** Investigated whether a client could forge an `order_status_events` row. **Not reproduced.** Row Level Security enforces `WITH CHECK (false)` for INSERT, and the trigger rejects any UPDATE or DELETE.
3. **Outbox Direct Manipulation:** Investigated whether clients could read or write `public.notification_outbox`. **Not reproduced.** RLS policies enforce `USING (false)` and `WITH CHECK (false)` on SELECT, INSERT, and UPDATE for all public roles.
4. **Push Notification PII Leakage:** Inspected all generated notification payloads. **Not reproduced.** Push titles and bodies contain only order numbers and status descriptions (e.g. `AY Pizza: Order Packed`). Customer phone numbers, addresses, receipt tokens, and payment references are strictly omitted.

---

## 5. Corrective Changes & New Migrations

### Corrective Migration: `20261022000009_phase4_2_1_adversarial_hardening.sql`
- **Path:** [`supabase/migrations/20261022000009_phase4_2_1_adversarial_hardening.sql`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261022000009_phase4_2_1_adversarial_hardening.sql)
- **Objects Added/Modified:**
  - `ALTER TABLE public.notification_outbox ADD COLUMN lease_expires_at TIMESTAMPTZ, ticket_id TEXT, receipt_checked_at TIMESTAMPTZ, receipt_status TEXT;`
  - `CREATE INDEX idx_notification_outbox_lease` on `(status, lease_expires_at) WHERE status = 'processing'`
  - `CREATE INDEX idx_notification_outbox_ticket` on `(ticket_id) WHERE ticket_id IS NOT NULL`
  - `CREATE INDEX idx_notification_outbox_unverified_receipts` on `(created_at) WHERE status = 'sent' AND ticket_id IS NOT NULL AND receipt_checked_at IS NULL`
  - `public.claim_notification_jobs(INT, INT)` with 5-minute lease expiry and automatic crashed-worker recovery
  - `public.finalize_notification_job(UUID, BOOLEAN, TEXT, BOOLEAN, TEXT)` with `ticket_id` recording
  - `public.get_unverified_notification_tickets(INT)` for receipt batching
  - `public.process_push_receipts(JSONB)` for receipt verification and token deactivation
  - `public.register_device_push_token(TEXT, TEXT, TEXT)` with authenticated ownership protection
  - `public.reject_order_event_tampering()` with hardened `search_path`

### Code Changes
- **Edge Function:** [`supabase/functions/push-processor/index.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/functions/push-processor/index.ts) — Mandatory Bearer authorization, lease integration, ticket ID tracking, and receipt verification polling.
- **Client Service:** [`src/domains/order/order-tracking-service.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/domains/order/order-tracking-service.ts) — Guest polling isolation, Realtime authorization check, monotonic version guards, and terminal cleanup.
- **Client Component:** [`src/components/OrderTrackingModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/OrderTrackingModal.tsx) — Indicator display (`LIVE`, `SYNC`, `FINAL`) and customer-only push prompt.
- **Auth Service:** [`src/domains/auth/auth-service.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/domains/auth/auth-service.ts) — Push token deactivation on logout.

---

## 6. Testing & Evidence

### Test Classification
1. **Unit Tests (Local In-Memory):** Status copy mappings, pickup vs delivery milestone sequences, monotonic version checking, cryptographic SHA-256 token hashing, idempotency key construction.
2. **Mocked Integration Tests (Local In-Memory):** Edge Function Bearer token authentication, lease allocation and expired-lease recovery, token hijacking prevention, Expo push ticket and receipt processing, `DeviceNotRegistered` deactivation, guest polling isolation, terminal teardown.
3. **Database Specification Tests:** Verified SQL schema syntax, indexes, function signatures, `search_path` declarations, and grant revocations.

### Verification Run Results

#### 1. Jest Test Suite (`npm test`)
```text
PASS src/__tests__/phase3-checkout-and-payment.test.ts
PASS src/__tests__/phase3-1-4-ambiguous-outcome-recovery.test.ts
PASS src/__tests__/phase4-1-3-kds-corrections.test.ts
PASS src/__tests__/security-and-integrity.test.ts
PASS src/__tests__/customizer-engine.test.ts
PASS src/__tests__/phase4-1-kds-operations.test.ts
PASS src/__tests__/auth-roles.test.ts
PASS src/__tests__/phase4-2-1-adversarial-review.test.ts
PASS src/__tests__/phase4-2-tracking-and-notifications.test.ts
PASS src/__tests__/phase3-1-1-final-security-verification.test.ts
PASS src/__tests__/phase4-1-1-kds-adversarial-verification.test.ts
PASS src/__tests__/phase2-1-verification.test.ts
PASS src/__tests__/catalog-validation.test.ts
PASS src/__tests__/phase3-1-3-final-concurrency-and-recovery.test.ts
PASS src/__tests__/delivery-service.test.ts
PASS src/__tests__/order-calculator.test.ts
PASS src/__tests__/cart-store.test.ts
PASS src/__tests__/phase3-1-security-verification.test.ts
PASS src/__tests__/phase3-1-2-recovery-and-concurrency.test.ts

Test Suites: 19 passed, 19 total
Tests:       248 passed, 248 total
Snapshots:   0 total
Time:        41.733 s
```

#### 2. TypeScript Type Check (`npx tsc --noEmit`)
```text
Exit code: 0 (Zero errors)
```

#### 3. Expo Doctor (`npx expo-doctor`)
```text
Running 20 checks on your project...
20/20 checks passed. No issues detected!
```

#### 4. Web Production Bundle (`npx expo export -p web`)
```text
Starting Metro Bundler
Web Bundled 5362ms index.ts (352 modules)
› web bundles (1):
_expo/static/js/web/index-51a8a7c6dc920f0a85642d11efb5fda4.js (994KB)
Exported: dist
Exit code: 0
```

#### 5. Android Production Bundle (`npx expo export -p android`)
```text
Starting Metro Bundler
Android Bundled 26429ms index.ts (763 modules)
› android bundles (1):
_expo/static/js/android/index-38149af244d03e74a5b66852f5fd986c.hbc (2.6MB)
Exported: dist
Exit code: 0
```

---

## 7. Real Environment Verification Status

| Environment / Capability | Status | Notes |
| :--- | :--- | :--- |
| **Local Jest & React Native Tests** | **VERIFIED (100%)** | 248 passing unit and mocked integration tests. |
| **Static Analysis & Type Safety** | **VERIFIED (100%)** | `tsc --noEmit` and `expo-doctor` passed with 0 warnings/errors. |
| **Real Local/Staging PostgreSQL** | **PENDING REMOTE DEPLOY** | Migration `20261022000009` authored and verified syntactically; requires applying to live Supabase project via `supabase db push`. |
| **Expo Push Receipts API** | **MOCKED & IMPLEMENTED** | Edge Function and database RPCs implemented to poll `/getReceipts`; live APNs/FCM receipt retrieval requires live Expo credentials. |
| **Physical Mobile Device Push** | **PENDING LIVE BUILD** | Push notifications require a physical iOS or Android device running a development or production build (`expo-device` guard). |

---

## 8. Remaining Limitations & Operational Requirements

1. **Edge Function Invocation Schedule:** The `push-processor` function is designed for scheduled invocation (e.g. pg_cron or Supabase Edge Cron running every 1–2 minutes) using a shared `CRON_SECRET`. In development or prior to configuring pg_cron, it must be triggered via authenticated HTTP requests.
2. **Expo Push Delivery Guarantee:** Delivery semantics are **at-least-once** with idempotent database deduplication. External APNs/FCM delivery depends on device connectivity, battery saver settings, and network availability.
3. **Receipt Retrieval Window:** Expo receipts are typically available 15 minutes after ticket submission. The `get_unverified_notification_tickets` function queries sent jobs within the last 24 hours to accommodate this delay.
4. **Guest Push Notifications:** As mandated by security guidelines, guest orders do not enqueue push notifications because guests have no authenticated identity linked to device push tokens. Guests track reliably using receipt-token polling.

---

## 9. Final Review Verdict

### **CONDITIONALLY ACCEPTED**

**Rationale:**  
All confirmed security and reliability defects (DEF-42-01 through DEF-42-07) have been identified, reproduced, and corrected. The codebase compiles cleanly, passes 248 tests across 19 suites, and produces functional web and Android production bundles. Acceptance is conditional upon executing standard remote staging verification: applying migration `20261022000009`, deploying the hardened `push-processor` Edge Function, and configuring scheduled cron triggers.

**Phase 4.3 is NOT authorized until staging deployment and end-to-end receipt verification are completed.**
