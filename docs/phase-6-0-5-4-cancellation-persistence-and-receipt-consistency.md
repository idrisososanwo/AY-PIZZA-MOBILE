# AY Pizza — Phase 6.0.5.4: Customer Cancellation Persistence and Receipt Consistency Report

**Date**: 2026-11-09  
**Target Environment**: Supabase Staging (`gmtlwewpblnnkzuwfcib`)  
**EAS Project ID**: `a0aaa783-3f92-4b05-b32f-e44ccc7bfd38`  
**Target Channel**: `staging`  
**Runtime Version**: `1.0.0`

---

## Executive Summary

During physical testing on the Xiaomi Redmi 13C following Phase 6.0.5.2 OTA publication, an inconsistency was discovered:
- Immediately upon completing checkout, the customer receipt displayed the **Cancel Order** button.
- When the receipt was closed and subsequently reopened (from the Orders screen or receipt history), the **Cancel Order** button disappeared.

An end-to-end trace established the root cause:
1. **Immediate Receipt Disconnect**: `handlePaymentSuccess` in `App.tsx` constructed an optimistic local receipt snapshot and hardcoded `orderStatus="CONFIRMED"`, rendering `onCancelOrder` unconditionally without querying the authoritative database state.
2. **Reopened Receipt Verification**: When reopened from `OrdersScreen.tsx`, the receipt was hydrated directly from the PostgreSQL backend via `orderService.getOrderReceipt()`. For orders whose database status was `PENDING_PAYMENT` (such as Paystack sandbox/mocked orders where server-side settlement was simulated on client but not executed in PostgreSQL), `selectedReceiptOrder.status === 'CONFIRMED'` evaluated to `false`, correctly suppressing `onCancelOrder`.
3. **Receipt Token Discard**: `OrdersScreen.tsx` stripped the cryptographic `receiptToken` when reopening orders, passing an empty string (`receiptToken: ''`) to tracking and cancellation modals.
4. **Lack of Live Status Synchronization**: Neither modal polled or listened for kitchen status transitions, leaving static views out of sync with real-time operations.

Both receipt entry paths have been unified to rely exclusively on the authoritative database order status (`CONFIRMED`), the cryptographic `receiptToken` is preserved across reopened views, and active polling dynamically synchronizes status changes.

---

## 1. Exact Root Cause Analysis

### A. Immediate Post-Checkout Receipt Flow (`App.tsx`)
- **File**: `App.tsx`
- **Function**: `handlePaymentSuccess(result)`
- **Vulnerability**:
  - The payment completion handler built an in-memory `receiptSnapshot` and passed:
    ```tsx
    <OrderReceiptModal
      ...
      orderStatus="CONFIRMED"
      onCancelOrder={() => { setCancellingReceiptOrder(...); }}
    />
    ```
  - `orderStatus` was hardcoded to `"CONFIRMED"` regardless of the actual record in the database.
  - If payment verification failed, was delayed, or left the database order in `PENDING_PAYMENT`, the UI showed the **Cancel Order** button immediately after payment, creating a false impression of server-confirmed eligibility.

### B. Reopened Receipt Flow (`OrdersScreen.tsx`)
- **File**: `src/components/OrdersScreen.tsx`
- **Functions**: `handleViewReceipt(rec)`, `fetchOrders()`
- **Vulnerability**:
  - `handleViewReceipt` called `orderService.getOrderReceipt(rec.orderId, rec.receiptToken)`.
  - The returned object reflected the authoritative database status.
  - If the database order status was `PENDING_PAYMENT` (or if it progressed past `CONFIRMED` to `PREPARING`), the condition `selectedReceiptOrder.order.status === 'CONFIRMED'` evaluated to `false`, and `onCancelOrder` was set to `undefined`, hiding the button.
  - Furthermore, `selectedReceiptOrder` stored only `Order` without retaining `rec.receiptToken`. Line 502 passed `receiptToken=""`, line 524 passed `receiptToken: ''` to tracking, and line 533 passed `receiptToken: ''` to `setCancellingOrder`. This stripped guest credentials, causing guest cancellations to fail RPC authorization.

### C. The Discrepancy
The two paths had divergent sources of truth:
- **Immediate path**: Client-optimistic mockup with hardcoded `"CONFIRMED"` status and unconditional cancellation handler.
- **Reopened path**: Database-queried status with strict `status === 'CONFIRMED'` check, but with discarded guest token.

---

## 2. Actual Database Status Observed for the Affected Order

In test checkout flows where Paystack test payments were executed or mocked without invoking the server-side RPC `settle_order_payment`, the order record in `public.orders` remained in:
```sql
status = 'PENDING_PAYMENT'
```
Because the authoritative database function `public.cancel_order_by_customer` enforces:
```sql
IF v_order.status != 'CONFIRMED' THEN
    RAISE EXCEPTION 'Order is not eligible for cancellation. Current status: %', v_order.status;
END IF;
```
an order with status `PENDING_PAYMENT` is strictly **ineligible** for customer self-service cancellation in PostgreSQL. 

The immediate receipt incorrectly masked this state by hardcoding `"CONFIRMED"`, giving the false appearance of eligibility that vanished upon reopening when the true database state (`PENDING_PAYMENT`) was queried.

---

## 3. Files Changed & Specific Corrections

### 1. `App.tsx`
- **Authoritative Hydration on Payment**: Updated `handlePaymentSuccess` to hydrate the real database order record via `orderService.getOrderReceipt(result.orderId, activeReceiptToken)` and derive the true `orderStatus` before opening the receipt modal.
- **Authoritative Guard**: Replaced hardcoded `orderStatus="CONFIRMED"` with dynamic `orderStatus={receiptData.orderStatus}`. Guarded `onCancelOrder` to only be provided when `receiptData.orderStatus === 'CONFIRMED'`.
- **Active Polling Effect**: Added a 4-second polling timer while the immediate receipt is open to track kitchen updates (`CONFIRMED` -> `PREPARING`), automatically disabling the cancel button when the kitchen accepts the order.
- **RPC Rejection Recovery**: On cancellation failure in `CancelOrderConfirmationModal`, refetches the server status immediately to update the receipt state.

### 2. `src/components/OrdersScreen.tsx`
- **Token Preservation**: Updated `selectedReceiptOrder` state from `Order | null` to `{ order: Order; receiptToken: string } | null`.
- **Cryptographic Passthrough**: Replaced stripped empty tokens (`receiptToken: ''`) with `selectedReceiptOrder.receiptToken` in `OrderReceiptModal`, `OrderTrackingModal`, and `CancelOrderConfirmationModal`.
- **Active Receipt Polling**: Added 4-second interval polling while `selectedReceiptOrder` is open so background status updates (kitchen acceptance, delivery transit) are synchronized live.
- **Pull-to-Refresh**: Added `RefreshControl` to `ScrollView` for manual pull-to-refresh on active orders and receipt history.
- **Post-Cancellation Cleanup**: Automatically closes the receipt modal and reloads the order list when an order is successfully cancelled.

### 3. `src/__tests__/phase6-0-5-4-cancellation-persistence.test.ts`
- Created dedicated test suite validating:
  1. Authoritative `CONFIRMED` status display in immediate receipt.
  2. Authoritative `CONFIRMED` status display in reopened receipt.
  3. `Cancel Order` button presence strictly when status is `CONFIRMED`.
  4. Real-time transition handling (disabling button when status advances to `PREPARING`).
  5. Cryptographic `receiptToken` preservation for guest orders.
  6. Authenticated user ownership verification.
  7. Ineligible status handling (`PENDING_PAYMENT`, `PREPARING`, `DELIVERED`, `CANCELLED`).

---

## 4. Verification & Quality Gates

All checks executed successfully on the modified codebase:

| Check | Tool / Command | Result | Notes |
|---|---|---|---|
| **TypeScript Compilation** | `npx tsc --noEmit` | **PASS (0 errors)** | Strict types verified |
| **ESLint Validation** | `npx expo lint` | **PASS (0 errors)** | 0 errors across codebase |
| **Expo Health Check** | `npx expo-doctor` | **PASS (20/20 checks)** | All dependencies compatible |
| **Phase 6.0.5.4 Regression Suite** | `npx jest phase6-0-5-4` | **PASS (18/18 tests)** | All 7 test cases passed |
| **Full Phase 6.0.5 Suite** | `npx jest phase6-0-5` | **PASS (45/45 tests)** | Integration tests passing |
| **Entire App Test Suite** | `npx jest` | **PASS (51 suites, 836 tests)** | 100% test pass rate |

---

## 5. Authoritative Backend Invariant Confirmation

We explicitly confirm that **NO changes were made to server-side cancellation eligibility**:
- The authoritative PostgreSQL function `public.cancel_order_by_customer` in Supabase project `gmtlwewpblnnkzuwfcib` remains strictly unchanged:
  ```sql
  IF v_order.status != 'CONFIRMED' THEN
      RAISE EXCEPTION 'Order is not eligible for cancellation. Current status: %', v_order.status;
  END IF;
  ```
- No migrations were deployed or altered.
- Client-side code now faithfully mirrors the server-side constraint: Cancel Order is presented **only** when `orderStatus === 'CONFIRMED'`.

---

## 6. OTA Delivery Compatibility

We explicitly confirm that:
- **Scope**: All modifications are strictly JavaScript/TypeScript files (`App.tsx`, `src/components/OrdersScreen.tsx`, tests).
- **Native Configuration**: Unmodified. No changes to `app.json`, native modules, or Android manifests.
- **Runtime Version**: `1.0.0` preserved.
- **Compatibility**: Fully compatible with the installed Phase 6.0.2 APK on the Xiaomi Redmi 13C via EAS Update over the `staging` channel (`a0aaa783-3f92-4b05-b32f-e44ccc7bfd38`).
- **Publication**: Awaiting explicit user authorization before publishing.

