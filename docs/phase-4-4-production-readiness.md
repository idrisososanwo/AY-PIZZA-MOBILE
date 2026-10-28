# AY Pizza — Phase 4.4: Production Readiness & Pre-Launch Architecture

**Date:** October 28, 2026  
**Status:** COMPLETE (Preparation & Pre-Launch Planning)  
**Target Environment:** PRODUCTION (Isolated from Staging `gmtlwewpblnnkzuwfcib` and AgroMarket)  
**Checkpoint Branch:** `checkpoint/phase-4-2-3-1`  
**Base Commit:** `f5cd74226aba015e1d9a3fe9481cd6c1194c4078`  
**Application ID:** `ng.aypizza.app` (Android & iOS)  

---

## 1. Executive Summary

Phase 4.4 establishes the complete operational architecture, database deployment strategy, live payment gateway requirements, push notification infrastructure, mobile release profiles, and restaurant operational checklist required to launch AY Pizza into commercial production.

This phase strictly preserves the existing staging environment (`gmtlwewpblnnkzuwfcib`) while preparing a repeatable, secure runbook for provisioning the isolated production project (`ay-pizza-prod`). No production resources are provisioned without explicit user authorization, no live payment keys are exposed, and no provisional restaurant policies are assumed without restaurant owner confirmation.

---

## 2. Readiness Status Classification

To ensure complete clarity across all engineering and operational domains, every requirement is classified into one of five categories:

| Status Tag | Definition | Current State |
| :--- | :--- | :---: |
| **`[IMPLEMENTED]`** | Code, configuration, or migration is already written, tested, and verified locally or on staging. | 100% of codebase, tests, and migrations |
| **`[PREPARED]`** | Runbooks, deployment scripts, and configuration schemas are fully drafted and awaiting execution. | 100% of deployment artifacts |
| **`[ACTION_REQUIRED: USER]`** | External developer account action that only the project owner can perform (e.g., Supabase dashboard, Paystack dashboard, Apple Developer, Google Play Console). | Detailed in Section 4 |
| **`[ACTION_REQUIRED: OWNER]`** | Business decisions and operational data that must be confirmed by the AY Pizza restaurant management. | Detailed in Checklist |
| **`[PHYSICAL_VERIFICATION]`** | Testing that requires physical mobile hardware (e.g., APNs/FCM push delivery to a physical device). | Pre-launch smoke test |

---

## 3. Workstream Architectural Reviews

### 3.1 Workstream 1: Production Architecture & Environment Isolation

#### Key Invariants:
1. **Strict Staging/Production Isolation:**
   - Production will run on its own dedicated Supabase project (expected reference: `ay-pizza-prod`, region: `eu-west-1`).
   - Staging (`gmtlwewpblnnkzuwfcib`) remains active for future feature branches, bugfixes, and regression testing.
   - AgroMarket's Supabase project and Paystack account remain strictly isolated and untouched.
2. **Configuration Segmentation:**
   - Client-side builds use compile-time environment injection via EAS Build profiles (`development`, `preview`, `production`) in `eas.json`.
   - `src/config/env.ts` enforces `validateProductionConfig()`, preventing production builds from booting if placeholder values are detected.
3. **Edge Functions Isolation:**
   - All 4 Edge Functions (`paystack-init`, `paystack-verify`, `paystack-webhook`, `push-processor`) will be deployed to the production Supabase project with production-only secrets.

---

### 3.2 Workstream 2: Production Database Strategy

#### Fresh Database Compatibility:
- All 15 migrations in `supabase/migrations/` apply sequentially from clean slate without external dependencies:
  1. `20261021000001_initial_schema.sql`: Core schema, 18 public tables, initial RLS, enums.
  2. `20261021000002_seed_ay_pizza.sql`: Authoritative menu catalog, sizes, toppings, and UNILAG delivery landmarks.
  3. `20261021000003_security_and_integrity_fixes.sql`: Security patches and payment references.
  4. `20261021000004_catalog_customization_links.sql`: Product-to-customization group relations.
  5. `20261021000005_phase3_checkout_and_paystack.sql`: Authoritative order placement and checkout RPCs.
  6. `20261021000006_phase3_1_security_verification.sql`: CSPRNG receipt token hashing and tamper-proof pricing.
  7. `20261022000001_phase3_1_1_security_hardening.sql`: Explicit `search_path = public, pg_temp` hardening.
  8. `20261022000002_phase3_1_2_payment_concurrency.sql`: Row-level locking for payment attempts.
  9. `20261022000003_phase3_1_3_payment_reservation.sql`: Two-phase payment reservation.
  10. `20261022000004_phase3_1_4_ambiguous_outcome_recovery.sql`: Gateway ambiguity recovery procedures.
  11. `20261022000005_phase4_1_kds_and_staff_operations.sql`: KDS queue functions, role helpers, and state transitions.
  12. `20261022000006_phase4_1_1_adversarial_hardening.sql`: KDS concurrency and role validation.
  13. `20261022000007_phase4_1_3_search_path_hardening.sql`: Security definer path hardening.
  14. `20261022000008_phase4_2_tracking_and_notifications.sql`: Append-only timeline events, push tokens, and outbox queue.
  15. `20261022000009_phase4_2_1_adversarial_hardening.sql`: Realtime authorization scoping and guest receipt isolation.

#### Data Sanitization:
- **Zero Test Data:** The migrations contain zero simulated test orders, mock transactions, or artificial customer profiles. The initial production database will be completely clean upon deployment.

---

### 3.3 Workstream 3: Paystack Production Readiness

#### Gateway Specifications:
1. **Live Merchant Credentials:**
   - Client App: `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_live_...`
   - Production Edge Functions: `PAYSTACK_SECRET_KEY=sk_live_...`
2. **Production Webhook Endpoint:**
   ```text
   https://<production-project-ref>.supabase.co/functions/v1/paystack-webhook
   ```
3. **Security Safeguards Verified:**
   - Raw byte body HMAC-SHA512 verification against `x-paystack-signature` using timing-safe comparison.
   - Dual server-to-server gateway verification against `https://api.paystack.co/transaction/verify/:reference` before database mutation.
   - NGN currency verification and strict integer kobo matching (`700,000` kobo = ₦7,000.00).
   - Atomic idempotent payment settlement (`public.settle_order_payment`).

---

### 3.4 Workstream 4: Push Notification Production Readiness

#### Pipeline Overview:
1. **Trigger-Based Enqueuing:** When order status changes, database trigger `trg_order_status_transition` enqueues jobs in `public.notification_outbox`.
2. **Worker Execution:** Edge Function `push-processor` runs every minute via `pg_cron` and `pg_net`, calling `claim_notification_jobs` (`FOR UPDATE SKIP LOCKED`).
3. **Expo Push API Dispatch:** Payloads are formatted and posted to `https://exp.host/--/api/v2/push/send` with Bearer authentication (`EXPO_ACCESS_TOKEN`).
4. **Resilience & Dead-Letter:**
   - Automatic exponential backoff for transient network errors.
   - Immediate token deactivation and dead-lettering upon receiving `DeviceNotRegistered`.
   - Permanent dead-lettering after 5 failed attempts.

---

### 3.5 Workstream 5: Production Security & Compliance

| Security Dimension | Staging Baseline | Production Enforcement |
| :--- | :--- | :--- |
| **Row-Level Security (RLS)** | Enabled on all 18 public tables | Enabled on all 18 public tables; zero public insert on audit/outbox/events |
| **Function Security** | All RPCs set `search_path = public, pg_temp` | Maintained; prevents search_path hijacking |
| **Edge Function Auth** | Protected by service key and caller tokens | Maintained; anonymous public access denied |
| **Webhook Verification** | HMAC-SHA512 timing-safe comparison | Secret vault stored; timing-safe character comparison |
| **CSPRNG Tokens** | Deterministic HMAC-SHA256 hash stored | Unhashed tokens never stored in database; guest receipt isolation enforced |
| **Staff Roles** | `kitchen`, `counter`, `manager`, `admin`, `staff` | Role checks enforced by `public.transition_order_status` |

---

### 3.6 Workstream 6: Mobile Release Configuration

#### App Manifest (`app.json`):
- **Display Name:** `AY Pizza`
- **Slug:** `ay-pizza`
- **Version:** `1.0.0`
- **Android Package:** `ng.aypizza.app`
- **iOS Bundle Identifier:** `ng.aypizza.app`
- **Orientation:** `portrait`
- **User Interface Style:** `dark` (consistent with brand identity)
- **App Icons:**
  - Standard Icon: `./assets/icon.png`
  - Android Adaptive Icon: `./assets/android-icon-foreground.png` (Background: `#2b1a12`)
  - Favicon: `./assets/favicon.png`

#### EAS Build Profiles (`eas.json`):
- `development`: Internal dev client with staging environment variables.
- `preview`: Standalone internal APK with staging environment variables.
- `production`: Store-ready AAB (Android App Bundle) and iOS archive with production channel, auto-incrementing build numbers, and production environment variables.

---

### 3.7 Workstream 7: Restaurant Launch Readiness

The physical restaurant operations at King Jaja Hall must align with mobile ordering:
- Kitchen counter pickup point and packaging stations.
- Delivery dispatch procedure and designated dispatch riders for campus/mainland deliveries.
- Real-time order monitoring via tablet running the KDS interface (`/kds` screen).
- Clear operational procedures for handling order rejections, ingredient run-outs, and customer refunds.

---

## 4. User External Account Action Items

The following actions require direct login to third-party dashboards and cannot be performed autonomously:

### 1. Supabase Dashboard (`supabase.com`)
- [ ] Create a new Supabase project named `ay-pizza-prod` in region `eu-west-1`.
- [ ] Record the production Project Reference, Database Password, URL, Anon Key, and Service Role Key.
- [ ] Enable `pg_net` and `pg_cron` extensions under **Database > Extensions**.

### 2. Paystack Dashboard (`dashboard.paystack.com`)
- [ ] Complete business verification (KYC, CAC registration, identity documents) for live processing.
- [ ] Add the verified Nigerian commercial bank settlement account for AY Pizza.
- [ ] Copy the **Live Public Key** (`pk_live_...`) and **Live Secret Key** (`sk_live_...`).
- [ ] Set the **Live Webhook URL** to `https://<production-project-ref>.supabase.co/functions/v1/paystack-webhook`.

### 3. Expo & EAS (`expo.dev`)
- [ ] Run `npx eas-cli login` to authenticate with your Expo account.
- [ ] Run `npx eas-cli project:init` to link `ng.aypizza.app` to your Expo organization.
- [ ] Create an Expo Personal Access Token for the notification worker (`EXPO_ACCESS_TOKEN`).

### 4. Apple Developer & Google Play Console
- [ ] Enroll in Apple Developer Program ($99/year) under AY Pizza or company name.
- [ ] Register Google Play Console Developer Account ($25 one-time fee).
- [ ] Configure EAS credentials (`eas credentials`) for automated iOS distribution certificates and Android upload keys.

---

## 5. Summary of Supporting Documents

1. [`docs/production-deployment-runbook.md`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/docs/production-deployment-runbook.md): Step-by-step technical commands for provisioning and deploying Supabase, Edge Functions, and EAS builds.
2. [`docs/production-environment-variables.md`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/docs/production-environment-variables.md): Complete specification of all client-side and server-side production environment variables.
3. [`docs/restaurant-launch-readiness-checklist.md`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/docs/restaurant-launch-readiness-checklist.md): Owner-facing operational sign-off for menu prices, toppings, delivery landmarks, and hours.
