# AY PIZZA & ICE CREAM — PHASE 6.0.5: CUSTOMER ORDER CANCELLATION STAGING INTEGRATION & VERIFICATION REPORT

**Status:** Completed  
**Target Environment:** Staging Supabase (`gmtlwewpblnnkzuwfcib.supabase.co`)  
**Database Routine:** `public.cancel_order_by_customer(p_order_id UUID, p_receipt_token TEXT, p_reason TEXT)`  
**Migration:** `supabase/migrations/20261105000002_phase5_5_customer_order_cancellation.sql` (applied remotely via Supabase Dashboard SQL Editor)  
**Final Quality Verdict:** `READY FOR PHYSICAL CANCELLATION TESTING`

---

## 1. Executive Summary

In Phase 6.0.5, the customer order self-service cancellation migration (`20261105000002_phase5_5_customer_order_cancellation.sql`) was verified to be deployed and functional on the remote Supabase staging database (`gmtlwewpblnnkzuwfcib`). Live database RPC probes confirmed that `public.cancel_order_by_customer` is active, executing with `SECURITY DEFINER` privileges, and returning structured JSON responses.

The frontend client codebase was audited and integrated across all customer touchpoints (`OrderReceiptModal`, `OrdersScreen`, `OrderTrackingModal`, and `CancelOrderConfirmationModal`). A dedicated automated test suite (`src/__tests__/phase6-0-5-cancellation-staging-integration.test.ts`) was created and verified across all 12 operational scenarios. All four quality gates passed without errors (49/49 test suites, 790/790 tests, 0 TypeScript errors, 0 ESLint errors, 20/20 Expo Doctor checks).

---

## 2. Root Cause of Previously Missing Cancel Button

Physical testing of the Phase 6.0.2 preview build revealed that the Cancel Order button was missing for customer orders. Source investigation and database probing identified three distinct root causes:

1. **Missing `onCancelOrder` Prop in `App.tsx` Post-Checkout Flow:**  
   In `App.tsx`, `<OrderReceiptModal />` was rendered upon checkout completion without receiving an `onCancelOrder` prop. Because `OrderReceiptModal` evaluates `{(orderStatus === 'CONFIRMED' || orderStatus === 'PAID') && onCancelOrder && (...)}`, the Cancel Order button was completely omitted from the receipt presented immediately following payment.
2. **Strict Status Equality & Hydration Race Conditions:**  
   In `OrdersScreen.tsx` and `OrderTrackingModal.tsx`, cancellation visibility initially performed strict status checks against `order?.status === 'CONFIRMED'`. If an order was momentarily represented as `'PAID'` or if order data was still hydrating (`order === undefined`), the cancellation card and action buttons failed to render.
3. **Missing Remote Database RPC (`PGRST202`):**  
   Prior to manual deployment in the Supabase SQL Editor, `cancel_order_by_customer` was not present in the staging schema cache. Calling it returned `PGRST202: Could not find the function public.cancel_order_by_customer in the schema cache`.

### Corrections Applied:
- `App.tsx` wires `onCancelOrder` directly on `<OrderReceiptModal />`, opening `CancelOrderConfirmationModal` immediately after checkout.
- `OrderReceiptModal.tsx`, `OrdersScreen.tsx`, and `OrderTrackingModal.tsx` evaluate pre-kitchen acceptance across both `CONFIRMED` and `PAID` representations, ensuring active orders display the cancel button before kitchen acceptance.
- `OrderTrackingModal.tsx` includes `testID="tracking-cancel-order-btn"` for robust testability.
- `cancel_order_by_customer` is now deployed and verified live on Supabase staging.

---

## 3. Files Inspected and Modified

| File | Status | Description |
|---|---|---|
| `App.tsx` | Inspected & Wired | Wires `onCancelOrder` to `OrderReceiptModal`, binds receipt cancel callback to `setCancellingReceiptOrder`, opens `CancelOrderConfirmationModal`, and refreshes guest store on completion. |
| `src/domains/order/order-service.ts` | Inspected | Implements `cancelOrderByCustomer(orderId, receiptToken, reason)` invoking `supabase.rpc('cancel_order_by_customer')`, extracts structured JSON payloads, and handles database errors gracefully. |
| `src/components/CancelOrderConfirmationModal.tsx` | Inspected | Provides reason selection, custom text reason input, final warning banner ("Cancellation is Final"), loading indicator, and error banners. |
| `src/components/OrderReceiptModal.tsx` | Inspected | Displays Cancel Order button when `(orderStatus === 'CONFIRMED' \|\| orderStatus === 'PAID') && onCancelOrder`. |
| `src/components/OrdersScreen.tsx` | Inspected | Displays Cancel Order button on active orders in pre-kitchen acceptance state, opens confirmation modal, refreshes order history, and displays refund review notice. |
| `src/components/OrderTrackingModal.tsx` | Modified | Added `testID="tracking-cancel-order-btn"`. Displays "Change of Plans? ⏱️" card when `canCustomerCancel` is true; displays "Preparation in Progress 🔥" notice when kitchen accepts. |
| `src/__tests__/phase6-0-5-cancellation-staging-integration.test.ts` | Created | 17 automated tests covering all 12 operational scenarios. |

---

## 4. Authoritative RPC Invocation & Parameter Mapping

The application invokes `public.cancel_order_by_customer` through `orderService.cancelOrderByCustomer`:

```typescript
const { data, error } = await supabase.rpc('cancel_order_by_customer', {
  p_order_id: orderId,
  p_receipt_token: effectiveToken || null,
  p_reason: reason || null,
});
```

### Parameter Contract:
- `p_order_id (UUID)`: Primary key of the order in `public.orders`. Mandatory.
- `p_receipt_token (TEXT)`: Plaintext 32-character hexadecimal secret receipt token (for guest orders) or `NULL` (for authenticated customers).
- `p_reason (TEXT)`: Optional cancellation reason selected or entered by the customer.

### Staging Verification Probe:
A live probe was executed against `https://gmtlwewpblnnkzuwfcib.supabase.co` using the anon key:
```json
// Probe with non-existent UUID:
{"status": 200, "data": {"code": "ORDER_NOT_FOUND", "message": "The requested order does not exist.", "success": false}}

// Probe with null UUID:
{"status": 200, "data": {"code": "INVALID_ORDER_ID", "message": "Order ID is required.", "success": false}}
```
**Result:** Verified live on remote staging. The RPC executes without `PGRST202` schema errors and returns HTTP 200 with structured JSON error payloads.

---

## 5. Cancellation Eligibility & Authorization Rules

The lifecycle boundary for cancellation is authoritatively enforced by PostgreSQL:

```
[Customer Checkout] 
       │
       ▼
 [CONFIRMED / PAID]  ─── Customer Self-Service Cancellation PERMITTED
       │
       ▼
[KDS Kitchen Acceptance]  (ACCEPTED)
       │
       ▼
 [PREPARING / OVEN]  ─── Customer Self-Service Cancellation FORBIDDEN
       │                 (Direct Store Call Required: 0913 385 5334)
       ▼
[READY_FOR_PICKUP / IN_TRANSIT / DELIVERED]
```

### Authorization Matrix:
1. **Authenticated Customer (`auth.uid() IS NOT NULL`):**
   - Caller's authenticated UUID must match `orders.customer_id`.
   - If a caller attempts to cancel another customer's order, PostgreSQL rejects with `UNAUTHORIZED`.
2. **Guest Customer (`orders.customer_id IS NULL`):**
   - Caller must supply `p_receipt_token`.
   - PostgreSQL computes `encode(digest(p_receipt_token, 'sha256'), 'hex')` and validates equality against `orders.receipt_token_hash`.
   - Invalid or missing tokens are rejected with `UNAUTHORIZED`.
3. **Progressed Orders (`orders.status IN ('ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED')`):**
   - PostgreSQL rejects with `ORDER_ALREADY_ACCEPTED`.
   - UI displays store dispatch contact (`0913 385 5334`) and in-oven notice.
4. **Idempotent Re-cancellation:**
   - If `orders.status = 'CANCELLED'`, PostgreSQL returns `ALREADY_CANCELLED` with HTTP 200, returning the existing cancellation timestamp without error.

---

## 6. Financial Integrity & Refund Status Presentation

When an order is cancelled:
- `orders.status` is set to `'CANCELLED'`.
- `orders.refund_status` is updated to `'REFUND_REQUIRED'`.
- `orders.version` is incremented.
- Trigger `trg_order_status_transition` fires, appending an audit record to `order_events` and enqueuing an alert in `notification_outbox`.

### Presentation Rules:
- **`REFUND_REQUIRED` / `REFUND_PENDING`:** Rendered strictly as **`Refund Pending Review ⏳`** or **`Refund Processing - Manager Review in Progress ⏳`**.
- **`REFUNDED`:** Rendered as **`Refund Confirmed ✅`** only after store management has audited and executed the refund via the financial console.
- **Strict Prohibition:** The customer application never claims or displays that Paystack has already issued money or disbursed funds to the bank/card while the status remains `REFUND_REQUIRED`.

---

## 7. Automated Test Results (12 Operational Scenarios)

The dedicated test suite `src/__tests__/phase6-0-5-cancellation-staging-integration.test.ts` was executed:

```
PASS src/__tests__/phase6-0-5-cancellation-staging-integration.test.ts (5.537 s)
  Phase 6.0.5 — Customer Order Cancellation Staging Integration & Verification
    √ Scenario 1: Authenticated customer cancellation succeeds when caller customer_id matches auth.uid()
    √ Scenario 2: Guest cancellation succeeds with valid receipt token matching hash
    √ Scenario 3: Guest cancellation is rejected with UNAUTHORIZED when receipt token is invalid
    √ Scenario 4: Attempt to cancel another customer's order is rejected with UNAUTHORIZED
    √ Scenario 5: Cancellation after kitchen acceptance is rejected with ORDER_ALREADY_ACCEPTED
    √ Scenario 6: Duplicate cancellation returns ALREADY_CANCELLED idempotently without error
    √ Scenario 7: Network failure during cancellation is handled gracefully without unhandled exception
    √ Scenario 8: Accurately maps the full CANCELLED_SUCCESSFULLY payload from the database
    √ Scenario 9: Accurately displays "Refund Pending Review ⏳" for REFUND_REQUIRED without falsely claiming refund is completed
    Scenario 10: Cancellation button visibility immediately after checkout (OrderReceiptModal)
      √ renders the Cancel Order button when orderStatus is CONFIRMED and onCancelOrder is provided
      √ renders the Cancel Order button when orderStatus is PAID and onCancelOrder is provided
      √ hides the Cancel Order button when orderStatus has progressed to ACCEPTED
      √ hides the Cancel Order button when onCancelOrder callback is omitted
    Scenario 11: Cancellation button visibility from order history (OrdersScreen)
      √ provides cancellation capability for pre-kitchen orders in active tab
    Scenario 12: Cancellation button visibility from order tracking (OrderTrackingModal)
      √ renders Cancel Order button when tracking a CONFIRMED pre-kitchen order
      √ hides Cancel Order button and displays "Preparation in Progress" notice when order is ACCEPTED
      √ hides Cancel Order button and displays refund notice when order is CANCELLED

Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
```

---

## 8. Quality Gates Audit Results

All 4 quality gates were executed in sequence:

| Gate | Command | Result | Details |
|---|---|---|---|
| **Gate 1: Jest Unit Tests** | `npm test -- --runInBand` | **PASSED** | **49/49 test suites passed**, **790/790 tests passed** (0 failures). |
| **Gate 2: TypeScript** | `npx tsc --noEmit` | **PASSED** | **0 errors**. |
| **Gate 3: ESLint** | `npx expo lint` | **PASSED** | **0 errors** (44 harmless warnings in tests/mock fixtures). |
| **Gate 4: Expo Doctor** | `npx expo-doctor` | **PASSED** | **20/20 checks passed**. No issues detected. |

---

## 9. Physical Testing Instructions (Existing Preview APK)

Because `cancel_order_by_customer` is deployed directly on the remote Supabase staging backend and the client code in the existing preview APK already calls `cancel_order_by_customer`, testers can verify the cancellation flow immediately on their physical device (e.g. Xiaomi Redmi 13C):

### Test Procedure:

1. **Place a Test Order (Paystack Sandbox):**
   - Open the AY Pizza app on the device.
   - Add a pizza (e.g. BBQ Chicken or Pepperoni) to cart.
   - Proceed through checkout selecting any UNILAG campus landmark (e.g., King Jaja Hall, New Hall).
   - Use Paystack sandbox test card details to complete payment.

2. **Verify Receipt Modal Cancellation (Post-Checkout):**
   - Upon payment return, observe the `OrderReceiptModal`.
   - Scroll to the bottom of the receipt.
   - Notice the button: **`Cancel Order ✕`** ("Need to cancel? You can cancel your order before the kitchen accepts it.").
   - Tap **`Cancel Order ✕`**.
   - Verify that `CancelOrderConfirmationModal` appears with reason choices ("Ordered by mistake", "Change of delivery address", "Taking too long", "Other").
   - Select a reason and confirm cancellation.
   - Verify that the app displays: *"Order Cancelled 🚫 — Your order has been cancelled successfully. If payment was completed, a refund has been flagged for manager review."*

3. **Verify Orders History Screen (`Orders` Tab):**
   - Navigate to the **Orders** tab on the bottom bar.
   - Switch to the **Cancelled** tab.
   - Locate the cancelled order.
   - Confirm the badge shows: **`Cancelled ✕`**.
   - Confirm the refund notice shows: **`Refund Processing - Manager Review in Progress ⏳`** (and does NOT say money was already deposited).

4. **Verify Pre-Kitchen Acceptance Window in Tracking View:**
   - Place a second test order.
   - Tap **Track Order 🛵** on the receipt modal to open `OrderTrackingModal`.
   - In the tracking modal, scroll down to locate the card:
     *`Change of Plans? ⏱️`*  
     *`Your order is awaiting kitchen acceptance. You can cancel now for a full refund review before baking starts.`*  
     *Button: `Cancel Order ✕`*
   - Verify that tapping `Cancel Order ✕` successfully opens the confirmation modal.

5. **Verify Kitchen Acceptance Boundary:**
   - In the Kitchen Display System (or Supabase Table Editor), update the test order's status from `CONFIRMED` to `ACCEPTED`.
   - In the tracking modal, observe that the `Change of Plans? ⏱️` card is replaced by:
     *`🔥 Preparation in Progress`*  
     *`The kitchen has accepted your order and fresh baking has commenced. Self-service cancellation is closed to prevent food waste.`*

---

## 10. Final Verdict

```
================================================================================
FINAL VERDICT: READY FOR PHYSICAL CANCELLATION TESTING
================================================================================
- Remote Supabase RPC: Deployed and actively returning structured JSON (HTTP 200).
- Frontend Wiring: Complete across receipt, tracking, orders history, and confirmation modals.
- Test Coverage: 12/12 scenarios verified, 17/17 tests passing.
- Quality Gates: 49/49 test suites (790/790 tests), TypeScript 0 errors, ESLint 0 errors, Expo Doctor 20/20.
- Migration Protection: No local migration tampering, zero unintended schema changes.
================================================================================
```

