# AY PIZZA & ICE CREAM — PHASE 6.0.5.4: CUSTOMER CANCELLATION OTA UPDATE PUBLICATION REPORT

**Status:** Successfully Published & Confirmed by EAS  
**Target Device:** Xiaomi Redmi 13C (Physical Device)  
**EAS Project ID:** `a0aaa783-3f92-4b05-b32f-e44ccc7bfd38`  
**EAS Account:** `shinobi04`  
**EAS Dashboard:** https://expo.dev/accounts/shinobi04/projects/ay-pizza/updates/7ff7e739-5aa3-4927-bcec-5cbd6eda2019  
**Publication Timestamp:** 2026-11-07T17:24:03Z

---

## 1. EAS Over-The-Air Update Metadata

| Attribute | Published Value | Verification Status |
|---|---|---|
| **Publication Status** | **`Published!`** | Confirmed by EAS CLI & Remote Branch Query |
| **Update Group ID** | `7ff7e739-5aa3-4927-bcec-5cbd6eda2019` | Listed on branch `staging` |
| **Android Update ID** | `01a1b709-e672-7626-b40a-e2816ce6dbbe` | Exported & Uploaded |
| **iOS Update ID** | `01a1b709-e672-7503-82ee-ee43fa8ac4b4` | Exported & Uploaded |
| **Branch** | `staging` | Verified (`01a1837e-774f-73c3-bf25-f65e9df2270b`) |
| **Target Channel** | `staging` | Mapped to branch `staging` |
| **Runtime Version** | `1.0.0` | Exact match with installed Phase 6.0.2 APK |
| **Platforms** | `android, ios` | Both bundles compiled and uploaded |
| **Update Message** | `Phase 6.0.5.2 Customer Cancellation Alignment` | Recorded on EAS Dashboard |
| **Base Git Commit** | `b62cc67f8f03998eb7f3b1950941d196ae728ddd*` | Local changes bundled into update |

---

## 2. Included Application Changes Delivered in this Update

The published bundle delivers the verified application code from Phases 6.0.2 through 6.0.5.1:

1. **Customer Order Cancellation Alignment (Phases 6.0.5 & 6.0.5.1):**
   - **Order Receipt Modal (`OrderReceiptModal.tsx`):** `Cancel Order ✕` button rendered strictly when `orderStatus === 'CONFIRMED'`. Removed `PAID` eligibility.
   - **Orders Screen (`OrdersScreen.tsx`):** `Cancel Order ✕` button rendered for active orders strictly when `order?.status === 'CONFIRMED'`. Fully guards hydrating state.
   - **Order Tracking Modal (`OrderTrackingModal.tsx`):** Displays "Change of Plans? ⏱️" card strictly when `order?.status === 'CONFIRMED'`. Shows "Preparation in Progress 🔥" once kitchen accepts. Shows "Refund Processing - Manager Review in Progress ⏳" when cancelled.
   - **App Wiring (`App.tsx`):** Post-checkout cancellation wired directly to `CancelOrderConfirmationModal.tsx`.
   - **RPC Integration:** Fully connected to deployed Supabase RPC `public.cancel_order_by_customer`.

2. **Push Notification Graceful Fallback (Phase 6.0.3):**
   - Reuses cached push tokens from `AsyncStorage`.
   - Prevents unhandled FCM token retrieval errors on preview builds without Google Services JSON.

3. **Customer Experience Usability (Phase 6.0.2):**
   - Password visibility controls (eye toggles) on login and registration forms.
   - Promotions and Offers drawer navigation.

---

## 3. Execution Notes & Error Resolutions

1. **NPM Tag Resolution Error:**
   - Attempted: `npx eas-cli@latest update ...`
   - Result: `npm error Invalid Version:` (caused by npm 11.19.1 resolving the `@latest` tag when a local version is already cached).
   - Fix: Executed `npx eas-cli` directly, utilizing the verified, stable EAS CLI.

2. **Non-Interactive Environment Flag:**
   - Attempted initial non-interactive run without `--environment`.
   - Result: EAS CLI required explicit `--environment` flag to bind server-side environment variables.
   - Fix: Passed `--environment preview` which matches the staging preview profile in `eas.json` (`EXPO_PUBLIC_APP_ENV=staging`, Supabase staging URL, and Paystack sandbox key).

---

## 4. Physical Testing Instructions for Xiaomi Redmi 13C

To test this update on the installed Phase 6.0.2 APK:

1. **Download the Update:**
   - Open the AY Pizza app on the Xiaomi Redmi 13C. Ensure device is connected to Wi-Fi or cellular data.
   - Close the app completely from the Android app switcher (kill the process).
2. **Apply the Update:**
   - Launch the AY Pizza app a second time. `expo-updates` will automatically launch the new bundle (`Update Group: 7ff7e739-5aa3-4927-bcec-5cbd6eda2019`).
3. **Verify Cancellation Flow:**
   - Place a test order using Paystack sandbox test cards.
   - Immediately observe the `Cancel Order ✕` button on the post-checkout receipt modal.
   - View the order in the `Orders` screen (`Active` tab) — verify the red `Cancel Order ✕` action appears.
   - Tap into tracking — verify the "Change of Plans? ⏱️" card is visible.
   - Tap `Cancel Order ✕`, select a reason, and confirm.
   - Verify the status immediately updates to `Cancelled ✕` with the manager refund review notice.

