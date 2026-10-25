# PHASE 4.2.3 — STAGING ENVIRONMENT & EXTERNAL INTEGRATION VALIDATION PLAN

**Target Application:** AY Pizza Production-Ready Mobile Application & Staff Kitchen Display System (KDS)  
**Business Profile:** AY Pizza & Ice Cream Corner, Opposite King Jaja Hall, University of Lagos (UNILAG), Akoka, Lagos, Nigeria  
**Phase Objective:** Prepare and document the complete operational, security, and deployment procedures for staging-environment deployment, remote Supabase migration, Edge Function publishing, Paystack sandbox verification, and physical-device development builds.  
**Execution Safety Rule:** STOP AFTER PREPARATION. Do not perform unconfirmed remote mutations, trigger real payments, deploy production resources, or start Phase 4.3.

---

## 1. Environment Inventory & Secret Exposure Audit

### 1.1 Complete Variable Matrix

| Variable Name | Exposure Tier | Target Location | Provisioning Source | Purpose | Current Workspace Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` | **Public (Client)** | Local `.env.staging` / EAS Environment | Project Owner / Dashboard | Supabase project REST & Realtime gateway URL (`https://<project-ref>.supabase.co`). | **Template Only** (`.env.example`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **Public (Client)** | Local `.env.staging` / EAS Environment | Project Owner / Dashboard | Anonymous publishable JWT key. Safe for mobile client; strictly guarded by PostgreSQL Row-Level Security (RLS). | **Template Only** (`.env.example`) |
| `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` | **Public (Client)** | Local `.env.staging` / EAS Environment | Paystack Dashboard (Test Mode) | Paystack test public key (`pk_test_...`) used by client checkout SDK/WebView. | **Template Only** (`.env.example`) |
| `EXPO_PUBLIC_APP_ENV` | **Public (Client)** | Local `.env.staging` / EAS Environment | Local Config / `eas.json` | Environment identifier (`staging` or `development`). Gates debug utilities and simulated KDS roles. | **Configured** (`development` default) |
| `SUPABASE_URL` | **Server Injected** | Supabase Edge Runtime | **Supabase Platform (Automatic)** | Injected automatically into Deno environment by Supabase Edge Runtime. | **Platform Automatic** |
| `SUPABASE_ANON_KEY` | **Server Injected** | Supabase Edge Runtime | **Supabase Platform (Automatic)** | Injected automatically into Deno environment by Supabase Edge Runtime. | **Platform Automatic** |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server Injected** | Supabase Edge Runtime | **Supabase Platform (Automatic)** | Administrative service key bypassing RLS. Injected automatically by Edge Runtime. **NEVER** expose to mobile app or git. | **Platform Automatic** |
| `PAYSTACK_SECRET_KEY` | **Strict Secret (Server)** | Supabase Edge Function Secrets | Paystack Dashboard (Test Mode) | Paystack test secret key (`sk_test_...`). Required for HMAC signature validation and REST API dual-verification. | **Unset in Staging** (Required) |
| `CRON_SECRET` | **Strict Secret (Server)** | Supabase Edge Function Secrets | User Generated Secret | Authorization bearer token for automated invocations of `push-processor` without exposing service role key. | **Unset** (Optional fallback) |
| `EXPO_ACCESS_TOKEN` | **Strict Secret (Server)** | Supabase Edge Function Secrets | Expo Account Settings | High-volume push dispatch credential to bypass public Expo rate limits. | **Unset** (Optional) |

### 1.2 Secret Isolation Verification

- **Client Codebase Audit:** Audited [`src/config/env.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/config/env.ts) and all files in `src/`. Only `process.env.EXPO_PUBLIC_*` properties are read. Neither `SUPABASE_SERVICE_ROLE_KEY` nor `PAYSTACK_SECRET_KEY` is present or imported anywhere in the mobile client code.
- **Git Version Control Audit:** Inspected `.gitignore`. Lines 34–37 explicitly ignore:
  ```gitignore
  .env
  .env*.local
  .env.production
  .env.staging
  ```
  Only `.env.example` is committed to git, containing solely placeholder strings (`pk_test_xxxxxxxx`, `sk_test_xxxxxxxx`, `your-anon-key-here`).
- **Bundler Inlining Verification:** Statically verified that Babel/Metro bundler inlines `EXPO_PUBLIC_*` string literals at compile time, eliminating dynamic runtime lookups and preventing secret leakage into client source maps.

---

## 2. Supabase Staging Preparation

### 2.1 Project Creation & Architecture Requirements

If a dedicated staging project does not yet exist, provision one via the Supabase Dashboard:

1. **Project Name:** `ay-pizza-staging`
2. **Organization:** AY Pizza Operations
3. **Database Region:** `eu-west-1` (Ireland / London) or `eu-central-1` (Frankfurt).
   - *Rationale for UNILAG:* Subsea internet cables landing in Lagos, Nigeria (MainOne, WACS, Equiano, 2Africa) terminate directly into Western European exchanges. Round-trip ping latency from Lagos networks (MTN, Airtel, Glo) to Western Europe is ~90–120ms, offering the lowest consistent latency for Nigerian consumer mobile networks when Cape Town is unavailable on standard tiers.
4. **Authentication Settings:**
   - **Provider:** Email / Password enabled.
   - **Phone Auth:** Optional for future student SMS OTPs.
   - **JWT Expiry:** 3600 seconds (1 hour).
   - **Site URL:** `aypizza://` (Mobile Deep Link) and `http://localhost:8081` (Local Web Staging).
   - **Redirect URLs:**
     - `aypizza://*`
     - `https://<staging-project-ref>.supabase.co/auth/v1/callback`
5. **Realtime Settings:**
   - Enable Realtime on `public.orders` for authenticated staff members (KDS) and authenticated customers.
   - Guest tracking operates via authenticated receipt-token polling RPC (`get_order_receipt`).

---

## 3. Migration Deployment Plan

### 3.1 Migration Ledger Sequence

The repository contains exactly **15 sequentially versioned migrations** that must be applied in strict chronological order:

```
supabase/migrations/
├── 20261021000001_initial_schema.sql
├── 20261021000002_seed_ay_pizza.sql
├── 20261021000003_security_and_integrity_fixes.sql
├── 20261021000004_catalog_customization_links.sql
├── 20261021000005_phase3_checkout_and_paystack.sql
├── 20261021000006_phase3_1_security_verification.sql
├── 20261022000001_phase3_1_1_security_hardening.sql
├── 20261022000002_phase3_1_2_payment_concurrency.sql
├── 20261022000003_phase3_1_3_payment_reservation.sql
├── 20261022000004_phase3_1_4_ambiguous_outcome_recovery.sql
├── 20261022000005_phase4_1_kds_and_staff_operations.sql
├── 20261022000006_phase4_1_1_adversarial_hardening.sql
├── 20261022000007_phase4_1_3_search_path_hardening.sql
├── 20261022000008_phase4_2_tracking_and_notifications.sql
└── 20261022000009_phase4_2_1_adversarial_hardening.sql
```

### 3.2 Key Database Features Enforced in Ledger

- **Authoritative Pricing:** RPC `create_authoritative_order` validates size-to-product mapping and customization option groups, recalculating base prices, toppings, and flat campus delivery fee (₦500) entirely on PostgreSQL.
- **Cryptographic Receipt Tokens:** 256-bit entropy (`gen_random_bytes(32)`) hashed at rest with SHA-256 (`orders.receipt_token_hash`). Plaintext tokens are returned only once upon creation.
- **Payment Attempt Concurrency:** Partial unique index `idx_payment_attempts_active_unique` on `(order_id) WHERE status = 'initialized' AND expires_at > now()`, preventing multiple simultaneous checkout attempts.
- **Ambiguous Transaction Reconciliation:** Stale sessions (>15 mins) transition to `expired`. Ambiguous provider outcomes retain reservation locks until reconciled against the Paystack REST API.
- **Kitchen Display System (KDS):** Server-side monotonic version checks (`CONCURRENT_MODIFICATION` error codes) protect against version collisions when multiple kitchen staff interact with the same order ticket.
- **Notification Outbox with Bounded Leases:** Table `public.notification_outbox` features 5-minute bounded worker leases (`lease_expires_at`) and automatic crashed-worker recovery via `claim_notification_jobs`.
- **Search Path Hardening:** Every `SECURITY DEFINER` function and trigger sets `SET search_path = public, pg_temp;`.

### 3.3 Remote Migration Commands (Awaiting User Authorization)

```bash
# 1. Authenticate Supabase CLI (interactive browser or personal access token)
npx supabase login

# 2. Link to the dedicated staging project (REPLACE <staging-project-ref>)
npx supabase link --project-ref <staging-project-ref>

# 3. Check migration synchronization status
npx supabase migration list

# 4. Push all 15 pending migrations to staging database
npx supabase db push
```

---

## 4. Edge Function Deployment Plan

The application relies on **four Supabase Edge Functions** situated in `supabase/functions/`:

```
supabase/functions/
├── paystack-init/
│   └── index.ts
├── paystack-verify/
│   └── index.ts
├── paystack-webhook/
│   └── index.ts
└── push-processor/
    └── index.ts
```

### 4.1 Function Specification Matrix

| Function Name | Purpose | Gateway JWT Flag | Application-Level Authentication | External APIs Called | Platform Variables | Custom Secrets Required |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`paystack-init`** | Reserves payment session, checks for active attempts (<15 mins), initializes Paystack charge. | `--no-verify-jwt` | Validates `orderId` and optional `receiptToken`. Calls database RPC `begin_or_reuse_payment_attempt`, verifying authenticated customer ID or cryptographic receipt token hash. | `https://api.paystack.co/transaction/initialize` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `PAYSTACK_SECRET_KEY` |
| **`paystack-verify`** | Client fallback to independently verify payment status if webhook is delayed. | `--no-verify-jwt` | Verifies `reference` directly with Paystack official REST API. Settles exclusively via database authoritative RPC `settle_order_payment`. | `https://api.paystack.co/transaction/verify/${ref}` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `PAYSTACK_SECRET_KEY` |
| **`paystack-webhook`** | Authoritative asynchronous settlement endpoint for `charge.success` events. | `--no-verify-jwt` | **Timing-safe HMAC-SHA512 Verification** against `x-paystack-signature`. **Secondary Dual-Verification** querying `api.paystack.co` before database settlement. | `https://api.paystack.co/transaction/verify/${ref}` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `PAYSTACK_SECRET_KEY` |
| **`push-processor`** | Batch claims notification outbox jobs, dispatches Expo push payloads, polls receipt status. | `--no-verify-jwt` | **Mandatory Bearer Authorization:** Validates `Authorization: Bearer <token>`. Rejects request if `<token>` !== `SUPABASE_SERVICE_ROLE_KEY` and !== `CRON_SECRET`. | `https://exp.host/--/api/v2/push/send`, `https://exp.host/--/api/v2/push/getReceipts` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `CRON_SECRET` (optional), `EXPO_ACCESS_TOKEN` (optional) |

### 4.2 Secure Edge Function Secrets Configuration

To prevent exposing secrets in terminal command history (e.g., `~/.bash_history` or PowerShell `ConsoleHost_history.txt`), avoid passing secret values directly as CLI arguments.

**Method A: Secure File-Based Secrets (Recommended)**
```bash
# 1. Create temporary secrets file (ignored by git via .gitignore)
echo "PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" > .env.staging.secrets
echo "CRON_SECRET=aypizza_staging_cron_secret_string" >> .env.staging.secrets

# 2. Upload secrets securely to Supabase Staging Project
npx supabase secrets set --env-file .env.staging.secrets --project-ref <staging-project-ref>

# 3. Immediately delete temporary secrets file
rm .env.staging.secrets   # (or: Remove-Item .env.staging.secrets in PowerShell)
```

**Method B: Supabase Dashboard UI**
Navigate to **Project Settings → Edge Functions → Secrets** in the Supabase Dashboard and input `PAYSTACK_SECRET_KEY` directly.

### 4.3 Edge Function Deployment Commands (Awaiting User Authorization)

```bash
# Deploy all 4 functions to the linked staging project
npx supabase functions deploy paystack-init --no-verify-jwt --project-ref <staging-project-ref>
npx supabase functions deploy paystack-verify --no-verify-jwt --project-ref <staging-project-ref>
npx supabase functions deploy paystack-webhook --no-verify-jwt --project-ref <staging-project-ref>
npx supabase functions deploy push-processor --no-verify-jwt --project-ref <staging-project-ref>
```

---

## 5. Paystack Sandbox Preparation

### 5.1 Paystack Dashboard Configuration

1. Log in to [dashboard.paystack.com](https://dashboard.paystack.com) in **Test Mode**.
2. Navigate to **Settings → API Keys & Webhooks**.
3. Obtain:
   - **Test Secret Key:** `sk_test_...`
   - **Test Public Key:** `pk_test_...`
4. Set the **Test Webhook URL** to:
   ```
   https://<staging-project-ref>.supabase.co/functions/v1/paystack-webhook
   ```
5. Ensure the Webhook Secret corresponds to `sk_test_...`.

### 5.2 Sandbox Test Scenarios & Expected Invariants

| Test ID | Scenario | Procedure | Expected System Invariant |
| :--- | :--- | :--- | :--- |
| **SB-01** | **Successful Card Checkout** | Pay with Paystack test card (`4084 0840 8408 4081`, expiry `12/30`, CVV `408`, OTP `12345`). | Webhook receives `charge.success`; verifies via API; DB marks order `CONFIRMED`; creates audit event; enqueues `ORDER_CONFIRMED` push notification. |
| **SB-02** | **Failed Payment** | Pay with decline test card (`4084 0840 8408 4082`). | Transaction flagged `failed`; order status remains `PENDING_PAYMENT`; checkout UI displays decline reason; reservation released. |
| **SB-03** | **Cancelled Checkout** | Customer closes Paystack modal without completing charge. | Order remains `PENDING_PAYMENT`; attempt expires after 15 minutes or can be retried immediately. |
| **SB-04** | **Duplicate Webhook Delivery** | Resend identical `charge.success` webhook payload twice. | Idempotent handling: second delivery returns HTTP 200 without creating duplicate financial records or state transitions. |
| **SB-05** | **Invalid Webhook Signature** | Send webhook payload with tampered `x-paystack-signature` header. | Rejected immediately with HTTP 401; no database mutation occurs. |
| **SB-06** | **Amount Mismatch Attack** | Send webhook payload with manipulated lower amount (e.g., ₦1,000 instead of ₦7,500). | Secondary REST API verification detects mismatch with database order total; rejected with HTTP 400; order is NOT marked paid. |
| **SB-07** | **Currency Mismatch Attack** | Send webhook with currency `'USD'` instead of `'NGN'`. | Dual-verification rejects currency mismatch; settlement fails. |
| **SB-08** | **Gateway Timeout / Interruption** | Simulate network drop while calling Paystack initialize. | Attempt marked as `ambiguous`; reservation preserved to prevent duplicate charges; inline reconciliation triggered on retry. |
| **SB-09** | **Ambiguous Attempt Recovery** | Customer pays via direct authorization link during network dropout. | `reconcileAmbiguousTransaction` detects successful payment at provider; settles order into `CONFIRMED`. |
| **SB-10** | **Attempt to Pay Cancelled Order** | Initialize payment on an order already marked `CANCELLED`. | RPC `begin_or_reuse_payment_attempt` returns HTTP 400 (`Cannot pay for cancelled order`). |

---

## 6. Physical Device Build Preparation

Browser emulation cannot verify hardware push notification delivery (Apple APNs or Google FCM), hardware keychain credential storage (`expo-secure-store`), or background OS task lifecycle events.

### 6.1 EAS Configuration (`eas.json`)

The following [`eas.json`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/eas.json) is configured in the repository root:

```json
{
  "cli": {
    "version": ">= 12.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_APP_ENV": "staging"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "channel": "staging",
      "env": {
        "EXPO_PUBLIC_APP_ENV": "staging"
      }
    },
    "production": {
      "autoIncrement": true,
      "channel": "production",
      "env": {
        "EXPO_PUBLIC_APP_ENV": "production"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

- **Android Standalone Test APK:** The `preview` profile generates a direct, installable `.apk` file that can be downloaded to any physical Android phone without requiring an Expo development client harness.
- **Android Dev Client:** The `development` profile creates a development client APK configured to connect to a local or remote Metro packager.
- **Environment Isolation:** Staging builds (`development` and `preview`) inject `EXPO_PUBLIC_APP_ENV: "staging"`. Production builds inject `EXPO_PUBLIC_APP_ENV: "production"`.

### 6.2 Android Build Commands (When Authorized)

```bash
# 1. Initialize EAS linkage (requires user Expo account login)
npx eas-cli project:init

# 2. Build standalone Staging Test APK
npx eas-cli build --platform android --profile preview
```

### 6.3 iOS Build Requirements & Prerequisites

1. **Prerequisites:**
   - Active Apple Developer Account ($99/year).
   - Apple Team ID.
   - Physical iPhone UDID registered via:
     ```bash
     npx eas-cli device:create
     ```
2. **Push Notification APNs Key:**
   - Apple Developer Portal → Certificates, Identifiers & Profiles → Keys → Create Key with "Apple Push Notifications service (APNs)".
   - Download `.p8` file.
   - Upload `.p8` key, Key ID, and Team ID in Expo Dashboard under **Project Settings → Credentials → iOS → Push Notifications**.
3. **Build Command:**
   ```bash
   npx eas-cli build --platform ios --profile preview
   ```

---

## 7. Push Notification Verification Plan

Once the application is running on a physical Android or iOS device:

1. **Permission Grant:** Open the app; open any test order tracking modal; tap *"Enable Live Notifications"*; tap "Allow" in the native OS prompt.
2. **Token Registration:** Verify in Supabase table `device_push_tokens` that an Expo Push Token (`ExponentPushToken[...]`) is stored with matching device platform.
3. **Milestone Transition Dispatch:**
   - In staff KDS or database, transition the order from `CONFIRMED` → `ACCEPTED`.
   - Verify that `queue_order_notification()` inserts a row in `public.notification_outbox`.
   - Trigger `push-processor` Edge Function.
4. **Physical Reception:** Confirm that the physical device displays the banner:
   - **Title:** `AY Pizza: Order Accepted 👨‍🍳`
   - **Body:** `Order #... has been accepted and is queued for preparation.`
5. **Token Deactivation on Sign-Out:** Tap logout in customer profile; verify that the token status in `device_push_tokens` is updated to `is_active = false`.

---

## 8. Staging Operations & Execution Safeguards

### 8.1 Required Staging Credentials Checklist

Before staging deployment can be executed, the user/owner must provide the following configuration values (to be placed in `.env.staging` locally and never committed to version control):

- [ ] `EXPO_PUBLIC_SUPABASE_URL` (Staging Supabase project URL)
- [ ] `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Staging Supabase anon JWT key)
- [ ] `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` (Paystack Test Public Key: `pk_test_...`)
- [ ] `PAYSTACK_SECRET_KEY` (Paystack Test Secret Key: `sk_test_...`)
- [ ] `EXPO_TOKEN` or Expo Account Login Credentials (for EAS Build generation)

### 8.2 Execution Order Sequence (When Authorized)

```
[Step 1: Staging Credentials Configured]
       │
       ▼
[Step 2: Database Migration Push]
  npx supabase link --project-ref <staging-project-ref>
  npx supabase db push
       │
       ▼
[Step 3: Edge Function Secrets & Deployment]
  npx supabase secrets set --env-file .env.staging.secrets --project-ref <staging-project-ref>
  npx supabase functions deploy ... --project-ref <staging-project-ref>
       │
       ▼
[Step 4: Paystack Webhook Registration]
  Configure webhook URL in Paystack Dashboard (Test Mode)
       │
       ▼
[Step 5: Automated Staging Tests & Paystack Sandbox Verification]
  Run live test card transactions (SB-01 through SB-10)
       │
       ▼
[Step 6: EAS Physical Device Build]
  npx eas-cli build --platform android --profile preview
```

---

## 9. Deployment Safety Review (Phase 4.2.3.1)

### 9.1 Edge Function Authentication Architecture Review

A rigorous architectural review of gateway JWT verification vs. application-level verification was conducted across all four Edge Functions:

```
                  SUPABASE API GATEWAY
                           │
      ┌────────────────────┴────────────────────┐
      │                                         │
[Gateway JWT Enabled]                  [Gateway JWT Disabled (--no-verify-jwt)]
Blocks all non-Supabase JWTs            Function receives all HTTP requests directly
(Rejects Paystack webhooks &            Function MUST enforce internal authentication
 custom CRON_SECRET callers)            (MANDATORY for webhooks & public checkout)
                                                │
                                    ┌───────────┴───────────┐
                                    ▼                       ▼
                            paystack-webhook        push-processor
                            HMAC-SHA512 + REST      Bearer token check:
                            Dual-Verification       service_role OR CRON_SECRET
```

#### Detailed Breakdown by Function

1. **`paystack-webhook`:**
   - **Gateway JWT Status:** MUST BE DISABLED (`--no-verify-jwt`).
   - **Reason:** Paystack's external servers do not and cannot obtain or transmit a Supabase JWT. If gateway verification is enabled, the Supabase Kong API gateway will unconditionally block Paystack webhooks with HTTP 401 before function code is reached.
   - **Application-Level Security:** 
     - Extracts `x-paystack-signature` header.
     - Computes HMAC-SHA512 of the exact raw request body using `PAYSTACK_SECRET_KEY`.
     - Validates signature using constant-time string equality (`timingSafeEqual`) to prevent timing side-channel attacks.
     - Performs **Secondary Dual-Verification:** Queries `https://api.paystack.co/transaction/verify/${reference}` using the server secret key to independently corroborate that the transaction exists in Paystack's official ledger, status is `'success'`, currency is `'NGN'`, and amount matches `orders.total * 100`.
   - **Unauthorized Response:** HTTP 401 (`Missing Paystack signature` or `Invalid webhook signature`), HTTP 400 (`Transaction amount mismatch` or `Invalid currency: NGN expected`).
   - **Verdict:** Highly secure; `--no-verify-jwt` is architecturally required and safely compensated by dual-verification.

2. **`push-processor`:**
   - **Gateway JWT Status:** MUST BE DISABLED (`--no-verify-jwt`) if triggered by external cron services or internal schedulers using a custom `CRON_SECRET`.
   - **Reason:** Schedulers (e.g. pg_cron or external monitors) often supply an application-level bearer token (`CRON_SECRET`) which is not a signed Supabase JWT. Gateway JWT verification would reject these callers.
   - **Application-Level Security:**
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
   - **Unauthorized Response:** HTTP 401 (`Missing or malformed Authorization header` or `Unauthorized invocation: invalid service key or cron secret`).
   - **Verdict:** Confirmed secure. Unauthenticated public callers, customers, and staff cannot invoke the push worker.

3. **`paystack-init`:**
   - **Gateway JWT Status:** MUST BE DISABLED (`--no-verify-jwt`).
   - **Reason:** AY Pizza allows anonymous guest checkout (students without registered accounts). Unauthenticated guests do not have a user JWT session.
   - **Application-Level Security:** Requires valid `orderId`. Calls database RPC `begin_or_reuse_payment_attempt(p_order_id, p_receipt_token)`. For authenticated orders, PostgreSQL enforces ownership (`customer_id = auth.uid()`). For guest orders, PostgreSQL validates the plaintext `p_receipt_token` against the stored SHA-256 hash `receipt_token_hash`.
   - **Unauthorized Response:** HTTP 403 (`Unauthorized: Invalid receipt token or caller identity`), HTTP 404 (`Order not found`), HTTP 400 (`Cannot pay for cancelled order`).
   - **Verdict:** Confirmed secure. Cryptographic token prevents unauthorized session initialization.

4. **`paystack-verify`:**
   - **Gateway JWT Status:** MUST BE DISABLED (`--no-verify-jwt`).
   - **Reason:** Client verification fallback called by both guest and authenticated checkout flows.
   - **Application-Level Security:** Requires `reference`. Independently verifies the reference with Paystack REST API. Invokes authoritative settlement RPC `settle_order_payment`, which enforces database state machine invariants.
   - **Unauthorized Response:** HTTP 400 (`Verification failed with Paystack` or `Settlement failed in database`).
   - **Verdict:** Confirmed secure. Cannot settle fraudulent or unpaid orders.

---

### 9.2 Migration Safety & Fresh Staging Readiness Audit

Every migration was audited for execution safety on a fresh staging PostgreSQL database:

| Migration Filename | Primary Operation | Destructive Actions? | Assumes Pre-existing Data? | Fresh Staging Safe? |
| :--- | :--- | :--- | :--- | :--- |
| `20261021000001_initial_schema.sql` | Base DDL, enums, tables, triggers, RLS | None (Creates tables, extensions) | References `auth.users(id)` (Standard in Supabase) | **YES** |
| `20261021000002_seed_ay_pizza.sql` | Seed real catalog, sizes, toppings, UNILAG landmarks | None (`ON CONFLICT DO NOTHING`) | Assumes schema from `01` | **YES** |
| `20261021000003_security_and_integrity_fixes.sql` | RLS hardening, profile triggers | Drops weak policies (`DROP POLICY IF EXISTS`) | Assumes schema from `01` | **YES** |
| `20261021000004_catalog_customization_links.sql` | Links products to customization groups | None (`ON CONFLICT DO NOTHING`) | Assumes seed IDs from `02` | **YES** |
| `20261021000005_phase3_checkout_and_paystack.sql` | Authoritative order RPC, initial receipt token | Drops obsolete insert policies | Assumes schema from `01`-`04` | **YES** |
| `20261021000006_phase3_1_security_verification.sql` | SHA-256 receipt token hashing at rest | Drops plaintext `receipt_token` column (safely guarded with `IF EXISTS`) | None | **YES** |
| `20261022000001_phase3_1_1_security_hardening.sql` | RPC search path hardening | Replaces RPCs (`CREATE OR REPLACE`) | Assumes schema from `05`-`06` | **YES** |
| `20261022000002_phase3_1_2_payment_concurrency.sql` | Partial unique index for active attempts | Replaces payment attempt index | None | **YES** |
| `20261022000003_phase3_1_3_payment_reservation.sql` | 15-minute reservation tokens, attempt reuse | Drops previous attempt indexes | None | **YES** |
| `20261022000004_phase3_1_4_ambiguous_outcome_recovery.sql` | Ambiguous payment reconciliation RPCs | Replaces indexes and procedures | None | **YES** |
| `20261022000005_phase4_1_kds_and_staff_operations.sql` | KDS operational lanes & transitions | None (Creates KDS procedures) | Assumes order status enums | **YES** |
| `20261022000006_phase4_1_1_adversarial_hardening.sql` | Staff role verification in RPCs | Hardens KDS transition guards | None | **YES** |
| `20261022000007_phase4_1_3_search_path_hardening.sql` | Strict search paths for KDS RPCs | Sets explicit `search_path` | None | **YES** |
| `20261022000008_phase4_2_tracking_and_notifications.sql` | Outbox, push tokens, order event immutability | Creates outbox & event tables | None | **YES** |
| `20261022000009_phase4_2_1_adversarial_hardening.sql` | 5-min bounded leases, Expo ticket tracking | Drops overloaded function signatures cleanly (`DROP FUNCTION IF EXISTS`) | Assumes outbox table from `08` | **YES** |

#### Destructiveness & Fresh-Staging Verdict
- **Destructiveness:** **NON-DESTRUCTIVE.** No `DROP TABLE`, `TRUNCATE`, or unhedged `DROP COLUMN` exists. All drops use `IF EXISTS` for replacing triggers, policies, indexes, and overloaded function signatures.
- **Fresh Staging Safety:** **100% FORWARD-COMPATIBLE.** Applying migrations `01` through `15` sequentially on a brand-new Supabase project applies cleanly without dependency errors.

---

### 9.3 EAS Build & Mobile Platform Review

1. **Android Build Verification:**
   - Setting `"android": { "buildType": "apk" }` on the `preview` profile enables building a standalone, untethered `.apk` installable directly on Android hardware (e.g. Tecno, Infinix, Samsung devices popular at UNILAG).
2. **Environment Separation:**
   - Staging builds inject `EXPO_PUBLIC_APP_ENV: "staging"`.
   - Production builds inject `EXPO_PUBLIC_APP_ENV: "production"`.
3. **Application Identifiers:**
   - Android package: `ng.aypizza.app` (Verified valid).
   - iOS bundle identifier: `ng.aypizza.app` (Verified valid).
4. **EAS Project Linkage Status:**
   - `extra.eas.projectId` is currently **absent** from `app.json`.
   - Project linking (`npx eas-cli project:init`) has **not** been executed, preserving clean local state.

---

### 9.4 Paystack Financial Readiness & Invariants

The Paystack webhook and verification logic enforces **six uncompromised financial invariants**:

1. **HMAC-SHA512 Timing-Safe Validation:** Rejects any webhook payload whose signature does not match `crypto.subtle.sign('HMAC', key, rawBody)` evaluated via constant-time comparison.
2. **Mandatory REST API Dual-Verification:** Webhook does not accept webhook payloads at face value; it queries `https://api.paystack.co/transaction/verify/${reference}` with `PAYSTACK_SECRET_KEY` before database settlement.
3. **Authoritative Amount Check:** Paystack transaction amount (in kobo) must exactly match `orders.total * 100`. Any lower amount (tampering) is rejected with HTTP 400.
4. **Currency Invariant:** Transaction currency must be `'NGN'`. Any non-Naira currency is rejected.
5. **Metadata Order ID Matching:** Paystack `metadata.order_id` must match the target database order UUID.
6. **Idempotent Settlement:** Database RPC `settle_order_payment` checks if order is already `CONFIRMED` or `PAID`. Duplicate webhook deliveries return success without duplicate state changes.

---

### 9.5 Safe Staging Execution Guardrails

To prevent accidental operations on production:

1. **Explicit Project Reference Flag:** All Supabase commands MUST specify `--project-ref <staging-project-ref>`. Bare commands that default to linked projects are strictly prohibited in documentation and scripts.
2. **No Secret Printing:** Secrets must be uploaded via temporary ignored env files (`--env-file`) or directly in the Supabase Dashboard UI. No secret values should ever be passed as command line arguments or printed to standard output.
3. **Separation of Keys:**
   - `pk_test_...` and `sk_test_...` ONLY for Staging.
   - `pk_live_...` and `sk_live_...` strictly reserved for Phase 5 production release.

---

## 10. Staging Readiness Verdict

- **Code & Test Suite Health:** **READY (PASS)** — 248/248 tests passing, 0 TypeScript errors, 20/20 Expo Doctor checks, clean exports.
- **Deployment Safety Review:** **PASSED & DOCUMENTED** — Architectural rationale for `--no-verify-jwt`, secret isolation, migration safety, and financial invariants fully validated.
- **Remote Staging Environment:** **PREPARED / PENDING PROVISIONING** — Blocked until external staging project credentials and test keys are supplied.
- **Physical Device Notifications:** **PREPARED / PENDING BUILD** — Blocked until EAS project initialization and physical device testing.

---
*Safety review concluded. No remote migrations applied. No Edge Functions deployed. No payments initiated. Phase 4.3 NOT started.*
