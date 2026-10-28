# AY Pizza — Phase 4.2.7: Live Paystack Sandbox Transaction & Settlement Verification Report

**Date:** October 28, 2026  
**Status:** COMPLETE & VERIFIED  
**Target Environment:** STAGING ONLY  
**Supabase Staging Project:** `gmtlwewpblnnkzuwfcib` (`eu-west-1`)  
**GitHub Checkpoint Branch:** `checkpoint/phase-4-2-3-1`  

---

## 1. Executive Summary & Milestone Completion

Phase 4.2.7 verified the complete end-to-end customer payment and settlement lifecycle using live Paystack sandbox transactions against the deployed AY Pizza staging environment.

The verification confirmed that:
1. The client mobile application successfully initializes live Paystack sandbox checkouts using server-authoritative order totals.
2. The Paystack sandbox checkout processes customer transactions (tested via `bank_transfer`).
3. Paystack delivers real-time `charge.success` webhooks to the staging Edge Function (`paystack-webhook`).
4. The backend securely validates the raw payload using HMAC-SHA512 timing-safe signature comparison and performs secondary server-to-server gateway verification directly against Paystack's API.
5. The PostgreSQL database transaction authoritatively transitions the order from `PENDING_PAYMENT` to `CONFIRMED`, marks the payment transaction `success`, emits a customer order status event, and generates an audit log entry.
6. The settlement RPC (`public.settle_order_payment`) is strictly idempotent, preventing duplicate confirmation or double-settlement.
7. Unsuccessful/abandoned checkout sessions are safely preserved in `PENDING_PAYMENT` without unintended status changes or settlement.

With this verification, **Phase 4.2.7 is complete**. Production Paystack activation and live credential provisioning remain distinct pre-launch milestones.

---

## 2. Successful Payment Lifecycle

The end-to-end payment flow on staging followed the authoritative sequence:

```
[Customer Mobile App]
       │
       ▼
1. create_order_authoritative() ────► Database creates Order (PENDING_PAYMENT)
       │
       ▼
2. paystack-init (Edge Function) ───► Database reserves Payment Attempt (idempotent lock)
       │
       ▼
3. Paystack Sandbox Checkout ───────► Customer completes checkout via Sandbox Bank Transfer
       │
       ├───────────────────────────────────────────────┐
       ▼                                               ▼
4. paystack-webhook (Edge Function)             5. Customer Confirmation Screen
       │                                               (Payment Successful)
       ├─► HMAC-SHA512 Signature Verification
       ├─► Secondary Gateway Verification (Paystack API)
       │
       ▼
6. public.settle_order_payment()
       ├─► Locks Order & Payment Transaction
       ├─► Validates exact amount (700,000 kobo) & currency (NGN)
       ├─► Updates Payment Transaction to 'success'
       ├─► Transitions Order status to 'CONFIRMED'
       ├─► Emits customer order status event
       └─► Writes authoritative audit log entry
```

---

## 3. Verified Staging Transaction Details

The live sandbox transaction was inspected across the Paystack gateway, Supabase Edge Functions, and PostgreSQL database records:

| Parameter | Authoritative Value | Verification Result |
| :--- | :--- | :--- |
| **Supabase Project** | `gmtlwewpblnnkzuwfcib` | Verified staging project |
| **Order ID** | `ede5be21-c4de-472b-a7ae-12e0f93679f4` | Verified |
| **Order Number** | `AYP-20261027-8165` | Verified |
| **Payment Attempt ID** | `1cf96752-0ec8-4363-b539-1047049aae6c` | Verified |
| **Paystack Gateway Reference** | `ay_ord_AYP_20261027_8165_1793116772730` | Verified |
| **Expected Total** | ₦7,000.00 (`700,000` kobo) | Exact match |
| **Currency** | `NGN` | Exact match |
| **Payment Gateway Channel** | `bank_transfer` | Verified |
| **Gateway Transaction Status** | `success` | Verified directly from gateway |
| **Order Status** | `CONFIRMED` | Authoritatively settled |
| **Payment Transaction Status** | `success` | Authoritatively settled |

---

## 4. Webhook Security & Dual Gateway Verification

The staging backend implements defense-in-depth for all incoming webhook events:

1. **HTTP Method & Header Validation:**
   - Non-POST requests are rejected with `405 Method Not Allowed`.
   - Requests lacking `x-paystack-signature` are rejected with `401 Unauthorized`.
2. **HMAC-SHA512 Signature Verification:**
   - The raw byte body of the incoming webhook request is hashed using HMAC-SHA512 and compared against the `x-paystack-signature` header using timing-safe character comparison to prevent timing side-channel attacks.
3. **Secondary Paystack API Verification:**
   - Even when the webhook signature matches, the Edge Function queries Paystack's REST API (`https://api.paystack.co/transaction/verify/:reference`) from the server using the backend secret key.
   - The transaction amount, currency, gateway status (`success`), and metadata order bindings are verified before database mutation.
4. **Processing Outcome:**
   - The webhook returned HTTP `200 OK`, recording successful receipt and triggering the database settlement RPC.

---

## 5. Authoritative Database Settlement & Idempotency Proof

### 5.1 Settled Database Records

#### `public.orders`
```json
{
  "id": "ede5be21-c4de-472b-a7ae-12e0f93679f4",
  "order_number": "AYP-20261027-8165",
  "status": "CONFIRMED",
  "total": "7000.00",
  "payment_reference": "ay_ord_AYP_20261027_8165_1793116772730",
  "created_at": "2026-10-27 15:59:21.663449+00",
  "updated_at": "2026-10-27 16:04:41.64005+00"
}
```

#### `public.payment_transactions`
```json
{
  "id": "1cf96752-0ec8-4363-b539-1047049aae6c",
  "order_id": "ede5be21-c4de-472b-a7ae-12e0f93679f4",
  "reference": "ay_ord_AYP_20261027_8165_1793116772730",
  "gateway": "paystack",
  "status": "success",
  "amount": "7000.00",
  "amount_in_kobo": 700000,
  "currency": "NGN",
  "created_at": "2026-10-27 15:59:32.73067+00",
  "updated_at": "2026-10-28 12:54:35.536945+00"
}
```

#### `public.order_status_events`
```json
{
  "id": "93de0b92-644e-4c58-a061-f3ce1f35654d",
  "order_id": "ede5be21-c4de-472b-a7ae-12e0f93679f4",
  "previous_status": "PENDING_PAYMENT",
  "new_status": "CONFIRMED",
  "title": "AY Pizza: Order Confirmed",
  "description": "Your pickup order #AYP-20261027-8165 has been confirmed.",
  "created_at": "2026-10-27 16:04:41.64005+00"
}
```

#### `public.audit_logs`
```json
{
  "id": "ec53c475-e777-451e-8d4a-f3b2dad7f58c",
  "target_type": "order",
  "target_id": "ede5be21-c4de-472b-a7ae-12e0f93679f4",
  "action": "PAYMENT_VERIFIED_AND_ORDER_CONFIRMED",
  "performed_by": "system:payment_settlement",
  "details": {
    "gateway": "paystack",
    "channel": "bank_transfer",
    "reference": "ay_ord_AYP_20261027_8165_1793116772730",
    "order_number": "AYP-20261027-8165",
    "amount_in_kobo": 700000
  },
  "created_at": "2026-10-27 16:04:41.64005+00"
}
```

### 5.2 Idempotency Verification

Replaying the settlement call against `public.settle_order_payment` with identical parameters demonstrated strict idempotency:
- **RPC Response:**
  ```json
  {
    "success": true,
    "already_settled": true,
    "order_id": "ede5be21-c4de-472b-a7ae-12e0f93679f4",
    "order_number": "AYP-20261027-8165",
    "status": "CONFIRMED"
  }
  ```
- **Audit Count:** Exactly 1 audit record exists for the order; replaying settlement created no additional entries and did not alter timestamps or order state.

---

## 6. Previous Abandoned Transaction Handling

During Phase 4.2.7.1, an earlier checkout attempt was tested where the customer session was abandoned prior to payment completion:

- **Order ID:** `7bb2738e-25bb-40d2-8a09-ca41ed52a5a7`
- **Order Number:** `AYP-20261027-1475`
- **Paystack Reference:** `ay_ord_AYP_20261027_1475_1793105861437`
- **Gateway Status:** `abandoned`
- **Database Status:** `PENDING_PAYMENT`

### Handling Assessment:
- The backend correctly refused to advance the order to `CONFIRMED`.
- The order remained strictly in `PENDING_PAYMENT`.
- No status events or settlement records were fabricated.
- The abandoned order remained completely isolated and untouched throughout the subsequent successful payment of `AYP-20261027-8165`.

This confirms the system's fail-safe behavior: orders cannot be confirmed without explicit, verified gateway success.

---

## 7. Staging Verification vs. Production Readiness

While the payment integration is fully verified on the staging backend, the following requirements distinguish staging verification from production readiness:

| Capability / Requirement | Staging Environment (Verified) | Production Launch Requirement (Pending) |
| :--- | :--- | :--- |
| **Gateway Environment** | Paystack Sandbox / Test Mode | Paystack Live Mode |
| **API Keys** | `pk_test_*` / `sk_test_*` | Registered live merchant keys (`pk_live_*` / `sk_live_*`) |
| **Settlement Account** | Simulated bank transfer / sandbox card | Active Nigerian commercial bank settlement account |
| **Business Compliance** | Test integration business profile | Verified KYC / Business documentation approved by Paystack |
| **Webhook Endpoint** | Staging Supabase Edge Function | Production Supabase Edge Function (`/functions/v1/paystack-webhook`) |
| **Live Secret Vault** | Staging Supabase Secrets Vault | Production Supabase Secrets Vault |
| **Automated Monitoring** | Manual log inspection & test queries | Real-time Sentry / edge function error monitoring & alerting |

---

## 8. Conclusion & Sign-Off

The AY Pizza payment architecture has successfully completed live sandbox verification. All payment initialization, client checkout integration, webhook handling, HMAC security, gateway dual-verification, and database settlement requirements have been validated with zero production code modifications and zero credential leakage.

**Phase 4.2.7 is hereby closed as COMPLETE.**
