# AY Pizza — Phase 4.5.1: Android Physical Device Test Build Report

**Execution Date:** 2026-10-28  
**Checkpoint Branch:** `checkpoint/phase-4-2-3-1`  
**Base Commit:** `ef9a564` (Phase 4.4 Milestone)  
**Expo SDK:** 58.0.19 / React Native 0.88.0 / React 19.3.0 / TypeScript 6.0.2  
**Target Platform:** Android Physical Device Test Build (APK)

---

## 1. Executive Summary

Phase 4.5.1 transitions the AY Pizza mobile application from staging operational verification and production preparation into physical Android device acceptance testing.

All native Android configuration parameters, build profiles, assets, deep links, permissions, and security guardrails were audited, adjusted, and validated against the staging Supabase backend (`gmtlwewpblnnkzuwfcib`) and Paystack test gateway (`pk_test_*`).

### Key Status Metrics
- **Android Application ID:** `ng.aypizza.app` (Authoritative)
- **Application Display Name:** `AY Pizza`
- **Application Version:** `1.0.0`
- **Build Profile:** `preview` (`distribution: internal`, `android.buildType: apk`, `channel: staging`)
- **Staging Environment Backend:** Supabase `https://gmtlwewpblnnkzuwfcib.supabase.co`
- **Payment Mode:** Paystack Sandbox (`pk_test_*`)
- **Native Scheme Configured:** `aypizza://`
- **Native Android Permissions Added:** `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`
- **TypeScript Check:** Clean (0 errors)
- **Unit & Integration Tests:** 20/20 suites passed, 258/258 tests passed
- **EAS Build Status:** Cloud CLI installed (`eas-cli@26.0.0`). Non-interactive dry execution halted cleanly at EAS authentication requirement per safety constraints.

---

## 2. Configuration & Asset Audit

### 2.1 Native App Configuration (`app.json`)
The Expo configuration was audited and updated to ensure complete native Android runtime compatibility:
- **`name`:** `"AY Pizza"`
- **`slug`:** `"ay-pizza"`
- **`version`:** `"1.0.0"`
- **`scheme`:** `"aypizza"` *(Added in Phase 4.5.1)*: Enables deep linking via `aypizza://` for browser redirect returns (Paystack checkout return) and notification click navigation.
- **`splash`** *(Hardened in Phase 4.5.1)*:
  ```json
  "splash": {
    "image": "./assets/splash-icon.png",
    "resizeMode": "contain",
    "backgroundColor": "#2b1a12"
  }
  ```
- **`android` Configuration:**
  - `package`: `"ng.aypizza.app"`
  - `adaptiveIcon`: Foreground `./assets/android-icon-foreground.png`, background `#2b1a12`.
  - `predictiveBackGestureEnabled`: `false` (avoids unhandled native back collisions during checkout).
  - `permissions` *(Added in Phase 4.5.1)*:
    - `"POST_NOTIFICATIONS"`: Required for Android 13+ (API level 33+) push notification prompts.
    - `"RECEIVE_BOOT_COMPLETED"`: Ensures notification channels and background listeners persist across device restarts.

### 2.2 EAS Build Profile Audit (`eas.json`)
The `eas.json` profiles were reviewed to confirm build targets:
1. **`preview` Profile (Used for Physical Device APK Testing):**
   ```json
   "preview": {
     "distribution": "internal",
     "android": {
       "buildType": "apk"
     },
     "channel": "staging",
     "env": {
       "EXPO_PUBLIC_APP_ENV": "staging"
     }
   }
   ```
   *Behavior:* Produces a standalone, sideloadable `.apk` file that can be transferred directly to physical Android devices via USB, ADB, or downloaded via link without Google Play Store involvement.
2. **`production` Profile (Google Play Store Release):**
   ```json
   "production": {
     "autoIncrement": true,
     "channel": "production",
     "env": {
       "EXPO_PUBLIC_APP_ENV": "production"
     }
   }
   ```
   *Behavior:* Produces an Android App Bundle (`.aab`) optimized for Play Store distribution.

### 2.3 Environment Variable & Credential Isolation
- Active client environment verified against `.env`:
  - `EXPO_PUBLIC_APP_ENV=staging`
  - `EXPO_PUBLIC_SUPABASE_URL=https://gmtlwewpblnnkzuwfcib.supabase.co`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Populated with valid staging anon key.
  - `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY`: Populated with Paystack test public key (`pk_test_*`).
- **Secrets Audit:** Verified that no sensitive backend secrets (Supabase `service_role` key, Paystack `sk_test_*` secret key, database passwords) exist in `app.json`, `eas.json`, or any bundle client source file.

---

## 3. Native Runtime Analysis & Hardening

| Subsystem | Audit Finding | Hardening Applied |
| :--- | :--- | :--- |
| **Push Notifications** | Android 13+ requires explicit runtime permission `POST_NOTIFICATIONS`. | Declared in `app.json` `android.permissions`. Notification channel `order_updates` initialized in `notification-service.ts`. |
| **Deep Linking & Paystack Return** | Native Android needs custom URL scheme intent filters. | Configured `scheme: "aypizza"` in `app.json` so links like `aypizza://order-status` or payment return redirects resolve to Expo Router. |
| **SecureStore** | Uses native Android Keystore / SharedPreferences for auth token storage. | Verified session storage in `auth-store.ts` handles null, empty, and native exceptions cleanly. |
| **AsyncStorage** | Offline cart and user preferences storage. | 258 Jest tests verify that AsyncStorage handles quota overflow, corrupted JSON envelopes, and schema migrations with automatic recovery. |
| **Network & SSL** | Android 9+ (API 28+) blocks cleartext HTTP by default. | All configured staging endpoints use strict TLS/HTTPS (`https://gmtlwewpblnnkzuwfcib.supabase.co`). |
| **App State Lifecycle** | Realtime websocket disconnects when Android OS backgrounds app. | Polling fallback is active in `useLiveOrderStatus` to resume synchronization upon app refocus. |

---

## 4. Test Suite & Verification Results

### 4.1 Automated Test Suites
- **Command:** `npm test -- --watchAll=false`
- **Result:** **PASSED** (Exit code: 0)
- **Suites:** 20 passed, 20 total
- **Tests:** 258 passed, 258 total
- **Coverage Areas:**
  - Order calculation & delivery fee validation
  - Cart store offline persistence & error recovery
  - Security, authorization roles & tamper prevention
  - Paystack server-side initialization & webhook settlement idempotency
  - KDS kitchen state machine & adversarial concurrency
  - Live order tracking & push notification dispatching

### 4.2 TypeScript Static Type Checking
- **Command:** `npx tsc --noEmit`
- **Result:** **PASSED** (Exit code: 0, 0 type errors)

### 4.3 Expo Configuration Validation
- **Command:** `npx expo config --type public`
- **Result:** **PASSED**
  - Confirmed resolved fields:
    - `name: "AY Pizza"`
    - `slug: "ay-pizza"`
    - `version: "1.0.0"`
    - `scheme: "aypizza"`
    - `android.package: "ng.aypizza.app"`
    - `android.permissions: ["RECEIVE_BOOT_COMPLETED", "POST_NOTIFICATIONS"]`

### 4.4 Expo Doctor Environment Diagnostics
- **Command:** `npx expo-doctor`
- **Result:** 19/20 checks passed (1 advisory regarding minor patch pin for `expo ~58.0.20`, no native build blockers).

---

## 5. EAS Staging Build Execution & Required Action

### 5.1 Build Command Attempted
Local execution of the EAS build command in non-interactive preview mode:
```powershell
.\node_modules\.bin\eas.cmd build --platform android --profile preview --non-interactive
```

### 5.2 Command Output
```text
An Expo user account is required to proceed.
Either log in with eas login or set the EXPO_TOKEN environment variable if you're using EAS CLI on CI (Learn more: https://docs.expo.dev/accounts/programmatic-access/)
    Error: build command failed.
```

### 5.3 External Authentication Action Required
Per safety constraints:
> *"If EAS authentication or project linking is missing, identify the exact required action and stop at that point rather than inventing credentials. Do not ask me to paste secrets into the conversation."*

The local repository is fully prepared, hardened, and verified for the staging APK build. To trigger the cloud APK generation on Expo Application Services (EAS):

1. **Step 1: Authenticate with EAS**
   Run the following command in the project terminal:
   ```bash
   npx eas login
   ```
   *(Enter your Expo username/email and password in your secure terminal prompt).*

2. **Step 2: Link Project (One-time setup)**
   ```bash
   npx eas project:init
   ```
   *(This links `ng.aypizza.app` to your Expo organization and adds `extra.eas.projectId` to `app.json`).*

3. **Step 3: Trigger Android Preview APK Build**
   ```bash
   npx eas build --platform android --profile preview
   ```
   *(EAS Cloud will run Continuous Native Generation, compile the Android APK, and return an installable `.apk` download URL and QR code upon completion).*

---

## 6. Physical Device Testing Protocol (Post-Build Runbook)

Once the APK is downloaded from the EAS build URL:

### 6.1 Installation
1. Enable **Install Unknown Apps** on the Android device (Settings → Security / Apps → Special App Access → Install Unknown Apps → Enable for Chrome / Drive / Files).
2. Download the `.apk` directly to the phone or transfer via ADB:
   ```bash
   adb install -r -d aypizza-preview.apk
   ```
3. Open **AY Pizza** from the app drawer.

### 6.2 Acceptance Test Checklist
1. **App Identity & Splash:**
   - Verify app icon displays properly on Android home screen.
   - Verify splash screen displays with `#2b1a12` dark background and contained pizza branding.
2. **Notification Permission Prompt:**
   - On Android 13+, confirm that the system displays the "Allow AY Pizza to send you notifications?" dialog upon launching the order flow. Tap **Allow**.
3. **Catalog & Cart Operations:**
   - Browse catalog items, customize pizza toppings, and add items to cart.
   - Force close the application, reopen, and verify cart contents remain intact via AsyncStorage.
4. **Checkout & Staging Paystack Payment:**
   - Proceed to checkout, enter delivery address in Ikeja, and select Paystack payment.
   - Paystack checkout modal loads in staging sandbox mode.
   - Complete payment using test card credentials or simulate completion.
   - Confirm immediate order confirmation screen and receipt of order number `AYP-YYYYMMDD-XXXX`.
5. **Realtime Kitchen Tracking & Notifications:**
   - Open KDS interface in browser (`/kds`).
   - Advance order from `PENDING_ACCEPTANCE` → `PREPARING` → `BAKING` → `READY_FOR_DELIVERY`.
   - Verify physical Android device updates order status in real time and displays native notification updates in the system tray.

---

## 7. Unresolved Blockers & Known Limitations
1. **EAS Account Session:** EAS CLI requires interactive authentication (`npx eas login`) by the account owner.
2. **Push Token Device Token Registration:** Push notifications require a physical Android device or development build; simulated Expo Go clients do not produce native APNs/FCM tokens. Physical device testing with this APK will validate real FCM token registration against the Supabase `user_push_tokens` table.
