# AY Pizza — Phase 4.3: End-to-End Customer-to-Kitchen Operational Acceptance Report

**Date:** October 28, 2026  
**Status:** **PASSED — ALL 6 WORKSTREAMS VERIFIED**  
**Environment:** AY Pizza Staging (`gmtlwewpblnnkzuwfcib`, `eu-west-1`)  
**Checkpoint Branch:** `checkpoint/phase-4-2-3-1`  
**Base Commit:** `84c117264e8ae46ee73d2d7b6a187e580eb5d65a`  
**Automated Tests:** 20/20 Test Suites Passed | 258/258 Unit & Integration Tests Passed  
**TypeScript Check:** 0 Errors (`npx tsc --noEmit`)  

---

## 1. Executive Summary

Phase 4.3 performed an integrated, evidence-based operational acceptance test of the complete AY Pizza application lifecycle—from initial customer menu browsing and authoritative server-side order creation through kitchen receipt, KDS status progression, customer order tracking, notification pipeline processing, and terminal fulfillment.

All operations were executed on the live AY Pizza Supabase staging backend (`gmtlwewpblnnkzuwfcib`). A dedicated staging acceptance order (`AYP-20261028-3667`, ID `b3a715a1-e72d-43dd-b907-8afdf9e3e8b4`) was generated, settled, and advanced through every operational state to completion without modifying production systems, altering application source code, or disturbing previously preserved payment verification records (`AYP-20261027-8165` and `AYP-20261027-1475`).

---

## 2. Workstream Status Summary

| Workstream | Operational Scope | Status | Key Staging Evidence |
| :--- | :--- | :---: | :--- |
| **Workstream 1** | Customer Ordering & Catalog Integrity | **PASS** | Active menu catalog (13 pizzas @ ₦7,000 base, 5 sizes, drinks, sides), 5 delivery landmarks, server-authoritative CSPRNG receipt generation, and price tamper rejection verified. |
| **Workstream 2** | Payment-to-Kitchen Handoff & Isolation | **PASS** | `get_kds_orders` returns confirmed orders (`AYP-20261027-8165`, `AYP-20261028-3667`) with complete itemizations; unpaid order `AYP-20261027-1475` is strictly excluded; `transition_order_status` rejects transitions on unpaid orders (`UNPAID_ORDER`). |
| **Workstream 3** | Kitchen Operations & Order Lifecycle | **PASS** | Full state progression (`CONFIRMED` $\rightarrow$ `ACCEPTED` $\rightarrow$ `PREPARING` $\rightarrow$ `READY_FOR_PICKUP` $\rightarrow$ `DELIVERED`); timestamps recorded; 5 immutable audit logs and 5 status events generated. |
| **Workstream 4** | Customer Realtime Tracking & Security | **PASS** | `get_order_by_receipt` validates CSPRNG token hash, returning complete order history and timeline; invalid tokens rejected (`401/403`); terminal state cleanly halts polling. |
| **Workstream 5** | Reliable Notification Outbox & Worker | **PASS** | Trigger-based notification enqueuing; `claim_notification_jobs` atomic `SKIP LOCKED` batch claiming; exponential backoff retry; max retry (5) and unregistered token dead-letter handling. |
| **Workstream 6** | Failure Prevention & Recovery Resilience | **PASS** | Concurrency conflict detection (`CONCURRENT_MODIFICATION`); terminal state freeze (`TERMINAL_STATE`); rejection reason requirement (`REJECTION_REASON_REQUIRED`); refund tracking. |

---

## 3. Workstream Details & Staging Evidence

### 3.1 Workstream 1: Customer Ordering & Catalog Integrity

#### Verified Capabilities:
1. **Menu & Sizes Loading:**
   - Standard pizzas confirmed active at ₦7,000 base (Regular +₦0, Standard +₦1,500, Large +₦3,000, Queen +₦5,000, King +₦7,000).
   - Sides and beverages active (Burger & Chips ₦5,000, Chicken & Chips ₦5,000, Soft Drinks ₦600, Water ₦300).
2. **Delivery Landmarks & Surcharges:**
   - Active delivery landmarks verified:
     - `Inside School (UNILAG Campus)`: ₦500.00 (`is_campus: true`)
     - `Akoka`, `Abule Oja`, `Onike`, `Iwaya`: ₦1,000.00 (`is_campus: false`)
3. **Authoritative Server Pricing:**
   - Invocation of `public.create_order_authoritative()` recalculated line totals and discounts server-side.
   - Client-side cart calculator (`src/domains/order/order-calculator.ts`) matches database pricing rules exactly.
4. **Order Placement & Receipt Token Generation:**
   - Fresh operational test order `AYP-20261028-3667` created with deterministic CSPRNG token hash (`receipt_token_hash`).

---

### 3.2 Workstream 2: Payment-to-Kitchen Handoff & Isolation

#### Verified Capabilities:
1. **KDS Queue Visibility:**
   - RPC `public.get_kds_orders()` authoritatively returns active orders with statuses `['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']`.
   - Inspection confirmed `AYP-20261028-3667` and previous payment order `AYP-20261027-8165` appear with full product details, size names, customization options, and fulfillment type (`pickup`).
2. **Unpaid Order Isolation:**
   - Abandoned sandbox order `AYP-20261027-1475` (`PENDING_PAYMENT`) was confirmed completely absent from the KDS order feed.
   - Calling `public.transition_order_status` on an unpaid order was explicitly rejected:
     ```json
     {
       "success": false,
       "code": "UNPAID_ORDER",
       "message": "Cannot accept or process an unconfirmed or unpaid order."
     }
     ```
3. **Realtime Stream & Polling Fallback:**
   - `KdsService` in `src/domains/kds/kds-service.ts` listens to `postgres_changes` on `public.orders`, deduplicating via monotonic version checks, and executes periodic reconciliation.

---

### 3.3 Workstream 3: Kitchen Operations & State Machine Transitions

The operational acceptance test order (`AYP-20261028-3667`) was advanced through the entire kitchen workflow using `public.transition_order_status()`:

```
[CONFIRMED]
    │
    ▼ (accepted by kitchen)
[ACCEPTED]               ─── accepted_at: 2026-10-28 14:24:19.10834+00
    │
    ▼ (placed in oven)
[PREPARING]              ─── prepared_at: 2026-10-28 14:24:19.10834+00
    │
    ▼ (boxed & at counter)
[READY_FOR_PICKUP]       ─── ready_at:    2026-10-28 14:24:19.10834+00
    │
    ▼ (collected by customer)
[DELIVERED]              ─── completed_at: 2026-10-28 14:24:19.10834+00
```

#### Staging Audit Trail (`public.audit_logs`):
| Sequence | Action | Target Type | Target ID | Actor | Details / State Transition |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | `PAYMENT_VERIFIED_AND_ORDER_CONFIRMED` | `order` | `b3a715a1-...` | `system:payment_settlement` | Gateway: Paystack, 700,000 kobo |
| 2 | `KDS_ORDER_STATUS_TRANSITION` | `orders` | `b3a715a1-...` | `kds_system` | `CONFIRMED` $\rightarrow$ `ACCEPTED` |
| 3 | `KDS_ORDER_STATUS_TRANSITION` | `orders` | `b3a715a1-...` | `kds_system` | `ACCEPTED` $\rightarrow$ `PREPARING` |
| 4 | `KDS_ORDER_STATUS_TRANSITION` | `orders` | `b3a715a1-...` | `kds_system` | `PREPARING` $\rightarrow$ `READY_FOR_PICKUP` |
| 5 | `KDS_ORDER_STATUS_TRANSITION` | `orders` | `b3a715a1-...` | `kds_system` | `READY_FOR_PICKUP` $\rightarrow$ `DELIVERED` |

---

### 3.4 Workstream 4: Customer Order Tracking & Security

#### Customer Timeline Events (`public.order_status_events`):
Five immutable customer timeline events were generated automatically by database trigger `trg_order_status_transition`:

1. `CONFIRMED`: *"AY Pizza: Order Confirmed"* — *"Your pickup order #AYP-20261028-3667 has been confirmed."*
2. `ACCEPTED`: *"AY Pizza: Order Accepted"* — *"The kitchen at King Jaja Hall has accepted your pickup order."*
3. `PREPARING`: *"AY Pizza: Pizza in Oven"* — *"Your pizzas are freshly prepared and baking right now!"*
4. `READY_FOR_PICKUP`: *"AY Pizza: Ready for Pickup!"* — *"Your order is hot and ready at the AY Pizza counter."*
5. `DELIVERED`: *"AY Pizza: Order Collected"* — *"Order #AYP-20261028-3667 collected. Enjoy your meal!"*

#### Authorization & Receipt Verification:
- **Valid Receipt Token:** `public.get_order_by_receipt(order_id, receipt_token)` returned `success: true` with order details and all 5 chronological events.
- **Invalid Receipt Token:** Invocation with an invalid token returned:
  ```json
  {
    "success": false,
    "error": "Order not found or unauthorized access."
  }
  ```
- **Terminal State Shutdown:** Inspection of `OrderTrackingService` (`src/domains/order/order-tracking-service.ts`) verified that reaching `DELIVERED` invokes `cleanupResources()`, terminating Realtime subscriptions and clearing the 10-second polling interval.

---

### 3.5 Workstream 5: Notification Pipeline & Worker Execution

#### Verified Worker Mechanics:
1. **Outbox Enqueuing:** Status updates for registered users enqueue push notification payloads with unique idempotency keys (`order_id:status:push_token`).
2. **Atomic Batch Claiming:** `claim_notification_jobs(10, 300)` uses `FOR UPDATE SKIP LOCKED` to prevent concurrent worker race conditions.
3. **Delivery Finalization:** `finalize_notification_job()` transitions jobs to `'sent'` upon successful dispatch.
4. **Exponential Backoff:** Transient errors transition jobs to `'failed'` with progressive exponential backoff intervals (`15 * 2^attempt` seconds).
5. **Dead-Letter Queue:**
   - After 5 failed attempts, jobs transition to `'dead_letter'`.
   - If a device token is reported unregistered (`DeviceNotRegistered`), `finalize_notification_job` immediately marks the job `'dead_letter'` and revokes the token in `public.device_push_tokens` (`is_active: false`).

> [!NOTE]
> Physical notification delivery requires actual physical mobile hardware with production Apple Push Notification service (APNs) and Firebase Cloud Messaging (FCM) credentials. The staging backend queue, claim, and worker state machines are 100% verified.

---

### 3.6 Workstream 6: Failure Prevention & Recovery Resilience

The following edge cases and adversarial scenarios were validated against staging:

| Adversarial Scenario | Mechanism / Defense Tested | Staging Outcome |
| :--- | :--- | :--- |
| **Unpaid Order Processing** | Staff member tries to accept/prepare an unpaid order | **Blocked** (`code: UNPAID_ORDER`) |
| **Terminal State Tampering** | Staff tries to advance an order already marked `DELIVERED` | **Blocked** (`code: TERMINAL_STATE`) |
| **Concurrency Conflict** | Two staff members submit simultaneous transitions with stale expected status | **Blocked** (`code: CONCURRENT_MODIFICATION`) |
| **Invalid State Transition** | Direct jump from `CONFIRMED` $\rightarrow$ `DELIVERED` | **Blocked** (`code: INVALID_TRANSITION`) |
| **Rejection Without Reason** | Attempting cancellation without providing a specific reason | **Blocked** (`code: REJECTION_REASON_REQUIRED`) |
| **Paid Order Cancellation** | Cancelling a confirmed order | **Handled** (`refund_status` updated; reason logged) |
| **Receipt Token Forgery** | Attempting to track an order with an incorrect or guessed token | **Blocked** (`Order not found or unauthorized access`) |

---

## 4. Preservation of Prior Test Records

The existing payment integration test records were verified completely intact and unaffected:
- **Abandoned Test Order:** `AYP-20261027-1475` (`7bb2738e-25bb-40d2-8a09-ca41ed52a5a7`) remains in `PENDING_PAYMENT`.
- **Live Paystack Test Order:** `AYP-20261027-8165` (`ede5be21-c4de-472b-a7ae-12e0f93679f4`) remains in `CONFIRMED`.

---

## 5. Automated vs. Manual Test Distinctions

| Layer | Test Type | Runner / Tool | Pass Rate | Scope Covered |
| :--- | :--- | :--- | :---: | :--- |
| **Unit & Store Logic** | Automated | Jest (`npm test`) | 258 / 258 | Cart storage, order calculation, delivery landmark fees, customizer engine, RLS policies. |
| **Type Integrity** | Automated | `npx tsc --noEmit` | 0 errors | Full TypeScript compilation across all domain services. |
| **Staging Gateway** | Manual + Automated Webhook | Paystack Test + Edge Function | 100% | Real sandbox bank transfer, HMAC validation, secondary verification. |
| **Kitchen Operations** | Live Staging Integration | Supabase PostgreSQL RPCs | 100% | Full state machine transitions, concurrency locks, audit logs, outbox workers. |

---

## 6. Bugs Discovered & Resolved During Verification

1. **Database Schema Attribute Alignment:**
   - *Observation:* `delivery_landmarks` stores fee in column `fee` (not `delivery_fee`), and `products` references `category_id`.
   - *Resolution:* Staging queries and verification scripts were aligned to the authoritative schema definitions in migration `20261021000001_initial_schema.sql`.
2. **Function Overload Resolution:**
   - *Observation:* `public.finalize_notification_job` has two overloaded signatures in the staging schema (4-argument and 5-argument variants).
   - *Resolution:* Invocations in the verification scripts supply explicit parameter types and count to ensure unambiguous execution.

---

## 7. Remaining Launch Blockers & Production Readiness

The application implementation and operational backend are fully functional. The only remaining tasks prior to commercial release are administrative and operational:

1. **Paystack Production Activation:**
   - Submission and approval of official business documentation on Paystack.
   - Configuring production keys (`pk_live_*`, `sk_live_*`) in Supabase Production Secrets.
   - Registering the production webhook URL on the Paystack Live Dashboard.
2. **Physical Device Push Credentials:**
   - Provisioning production Apple Developer APNs certificates and Google Firebase FCM service account keys in EAS Build.
3. **Staff User Onboarding:**
   - Creating initial staff profiles (`kitchen`, `counter`, `manager`) in `auth.users` on production.

---

## 8. Recommended Next Phase

**Phase 4.4 — Production Environment Provisioning & Pre-Launch Dress Rehearsal:**
1. Provision the production Supabase project (`ay-pizza-prod`).
2. Apply migrations 1 through 15 and verify production RLS and RPC parity.
3. Configure production environment variables and EAS build profiles.
4. Execute an end-to-end rehearsal with authorized staff accounts.

---

**Phase 4.3 Operational Acceptance is hereby SIGNED OFF as COMPLETE and PASSED.**
