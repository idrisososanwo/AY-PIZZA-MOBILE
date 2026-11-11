# AY PIZZA — Phase 6.0.5.4: Staging Over-The-Air (OTA) Publication Report

**Publication Date:** November 10, 2026  
**Environment:** STAGING ONLY  
**Channel:** `staging`  
**Runtime Version:** `1.0.0`  
**EAS Project ID:** `a0aaa783-3f92-4b05-b32f-e44ccc7bfd38`  
**EAS Account:** `shinobi04`  
**EAS Dashboard:** https://expo.dev/accounts/shinobi04/projects/ay-pizza/updates/c0869cc2-8472-44c9-9ed1-739bed9ec021  
**Publication Status:** CONFIRMED & ACTIVE ON STAGING CHANNEL

---

## 1. EAS OTA Publication Metadata

| Parameter | Published Value | Status |
|:---|:---|:---|
| **EAS Update Group ID** | `c0869cc2-8472-44c9-9ed1-739bed9ec021` | Confirmed by EAS CLI |
| **Android Update ID** | `01a1c6f0-3a24-70b5-8399-76e0035891a8` | Exported & Uploaded |
| **iOS Update ID** | `01a1c6f0-3a24-75fe-a916-373065766351` | Exported & Uploaded |
| **Publication Timestamp** | `2026-11-10T19:29:56Z` | Confirmed |
| **Target Channel** | `staging` | Pointed to branch `staging` |
| **Runtime Version** | `1.0.0` | Matches installed preview APK |
| **Platforms** | `android, ios` | Both platform bundles compiled |
| **Update Message** | `"Phase 6.0.5.4 Customer Cancellation and Receipt Consistency Fix"` | Recorded on EAS Dashboard |
| **Environment Binding** | `--environment preview` | Plain text and sensitive staging variables loaded |

---

## 2. Pre-Publication Verification Checklist Results

| # | Verification Check | Scope / Details | Result |
|:---|:---|:---|:---|
| **1** | **Receipt Status Hydration & Token Persistence** | `App.tsx` hydrates authoritative order via `orderService.getOrderReceipt(...)` on payment success. `OrdersScreen.tsx` preserves cryptographic `receiptToken` in `selectedReceiptOrder` state. | **PASS** |
| **2** | **Cancellation RPC Matching** | Inspected live function `public.cancel_order_by_customer(p_order_id, p_receipt_token, p_reason)` on staging. Verified `order-service.ts` calls it with exact argument names. | **PASS** |
| **3** | **Strict Cancellation Eligibility** | Cancellation is restricted strictly to `orderStatus === 'CONFIRMED'`. Pre-kitchen acceptance verified across `OrderReceiptModal`, `OrdersScreen`, and `OrderTrackingModal`. | **PASS** |
| **4** | **Receipt, History & Tracking Token Preservation** | `receiptToken` passed to tracking, cancellation modal, and receipt modal. Active 4s interval polling synchronizes status transitions in background. | **PASS** |
| **5** | **Reopen Eligible Order Cancellation Visibility** | Reopened orders fetch database status; if `CONFIRMED`, `onCancelOrder` is passed, displaying the **Cancel Order** button. | **PASS** |
| **6** | **Cancelled Orders Action Suppression** | When status is `CANCELLED`, `onCancelOrder` evaluates to `undefined`, immediately suppressing the action. | **PASS** |
| **7** | **Native Runtime & Channel Compatibility** | Runtime version is locked to `1.0.0` (matching installed APK). Channel `staging` is mapped to branch `staging`. | **PASS** |
| **8** | **Payment Integration Compatibility** | Payment verification calls `paystack-verify` and simulation calls `paystack-simulate`, both integrating with newly deployed Phase 6.0.6.8 backend. | **PASS** |
| **9** | **Full Quality & Compatibility Suite** | - TypeScript (`npx tsc --noEmit`): **0 errors**<br>- Jest (`npx jest`): **54/54 suites, 911/911 tests passing**<br>- Expo Lint (`npx expo lint`): **0 errors**<br>- Expo Doctor (`npx expo-doctor`): **20/20 checks passed** | **PASS** |

---

## 3. Compatibility Assessment

- **Native Runtime Stability:** No native modules, Gradle configurations, or Expo config plugins were modified. The update is 100% JavaScript and asset bundle changes, guaranteeing complete binary compatibility with the existing installed Android APK on the physical test device (Xiaomi Redmi 13C).
- **No Incompatible Native Changes Detected:** Expo Doctor confirmed 20/20 checks passed with zero native dependency mismatches.

---

## 4. Exact Instructions for Updating the Existing Android Test App (Xiaomi Redmi 13C)

To apply this OTA update to the existing installed staging test app on the Xiaomi Redmi 13C:

1. **Ensure Internet Connectivity:**  
   Connect the device to Wi-Fi or cellular data.

2. **First Launch (Fetch New Bundle):**  
   - Open the AY Pizza app.  
   - Wait 3–5 seconds on the home screen while `expo-updates` checks for and downloads the new bundle in the background (`Update Group: c0869cc2-8472-44c9-9ed1-739bed9ec021`).

3. **Restart the App (Apply Update):**  
   - Close the AY Pizza app completely.  
   - Swipe it away from the Android Recent Apps / Task Switcher (kill the process).  
   - Relaunch the AY Pizza app. The app will launch with the newly applied bundle.

4. **Verification Flow:**  
   - Place an order using Paystack sandbox or staging simulation.  
   - Observe the post-checkout receipt: verify `Cancel Order ✕` appears while in `CONFIRMED` status.  
   - Close the receipt.  
   - Navigate to the **Orders** tab and tap the order under **Receipt History** or **Active Orders**.  
   - Reopened receipt now displays the **Cancel Order ✕** button.  
   - Tap **Cancel Order ✕**, select a reason, and confirm.  
   - Observe the order update to `Cancelled ✕` with the manager refund review notice.  
   - Reopen the cancelled receipt: verify the `Cancel Order` button is completely suppressed.

---

## 5. Strict Execution Boundaries Compliance

- [x] **Staging channel exclusively:** Published solely to `channel: staging` / `branch: staging`.
- [x] **No production publication:** Channel `production` was untouched.
- [x] **No new native build created:** Leveraged existing native runtime 1.0.0.
- [x] **No signing credentials changed:** Kept existing EAS credentials.
- [x] **No Git commit or push:** Local working directory and branch `checkpoint/phase-4-2-3-1` remain clean.

