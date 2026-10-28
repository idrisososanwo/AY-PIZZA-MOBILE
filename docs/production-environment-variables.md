# AY Pizza — Production Environment Variables & Secrets Reference

**Document Version:** 1.0.0  
**Scope:** Client Mobile App, Supabase Edge Functions, Database Extensions, EAS Build  

---

## 1. Security Architecture & Rules

1. **Client Bundling Separation:**
   - Any variable prefixed with `EXPO_PUBLIC_*` is embedded directly into client JavaScript bundles.
   - **RULE:** Never store private keys, secret keys, service-role keys, or database credentials in any `EXPO_PUBLIC_*` variable.
2. **Server-Side Secrets Protection:**
   - Server secrets are stored exclusively in Supabase's encrypted Vault via `supabase secrets set` or the Supabase Dashboard.
   - They are never checked into Git, committed to `.env`, or exposed in application logs.
3. **Environment Segregation:**
   - Staging credentials (`gmtlwewpblnnkzuwfcib`, `pk_test_*`, `sk_test_*`) must NEVER be mixed with Production credentials (`ay-pizza-prod`, `pk_live_*`, `sk_live_*`).

---

## 2. Complete Environment Variable Inventory

| Variable Name | Target Scope | Classification | Production Format / Value | Description |
| :--- | :--- | :--- | :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` | Mobile App | Client Public | `https://<prod-ref>.supabase.co` | Production Supabase project endpoint. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Mobile App | Client Public (RLS) | `eyJhbGciOi...` | Supabase publishable anonymous key (protected by RLS). |
| `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` | Mobile App | Client Public | `pk_live_...` | Live Paystack public key for client checkout initialization. |
| `EXPO_PUBLIC_APP_ENV` | Mobile App | Client Public | `production` | Environment identifier (`development` \| `staging` \| `production`). |
| `PAYSTACK_SECRET_KEY` | Edge Functions | **SERVER SECRET** | `sk_live_...` | Live Paystack secret key for server-side verification and webhook HMAC. |
| `CRON_SECRET` | Edge Functions & DB | **SERVER SECRET** | 32-char CSPRNG string | Bearer token for authenticating `push-processor` invocations via `pg_cron`. |
| `EXPO_ACCESS_TOKEN` | Edge Functions | **SERVER SECRET** | Expo Personal Access Token | Bearer token for Expo Push Notification API dispatch. |
| `SUPABASE_URL` | Edge Functions | System Auto-Injected | Auto-managed by Supabase | Injected automatically into Edge Function runtime. |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | System Auto-Injected | Auto-managed by Supabase | High-privilege key used exclusively inside Edge Functions for authoritative settlement. |

---

## 3. Client Environment Variables Specification

Client variables are configured in EAS Secrets or local `.env` (excluded by `.gitignore`):

### `EXPO_PUBLIC_SUPABASE_URL`
- **Purpose:** Connects Supabase client SDK (`@supabase/supabase-js`) to the production instance.
- **Example:** `https://aypizzaprodxyz.supabase.co`
- **Validation:** Must be a valid HTTPS URL ending in `.supabase.co` and cannot contain `placeholder`.

### `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- **Purpose:** Used for anonymous and authenticated client requests. Protected by PostgreSQL Row-Level Security.
- **Example:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Validation:** Must be a valid JWT and cannot contain `placeholder`.

### `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY`
- **Purpose:** Identifies the AY Pizza merchant account to Paystack's client SDK.
- **Production Prefix:** Must start with `pk_live_`.
- **Validation:** In production mode (`EXPO_PUBLIC_APP_ENV=production`), `src/config/env.ts` and `PaystackProvider` reject `pk_test_` keys.

### `EXPO_PUBLIC_APP_ENV`
- **Purpose:** Dictates application runtime assertions, logging levels, and configuration checks.
- **Production Value:** `production`
- **Behavior:** Toggles `Config.isProduction = true`, which enables strict credential non-placeholder validation in `src/config/env.ts`.

---

## 4. Server-Side Edge Function Secrets Specification

Configured via `supabase secrets set --project-ref <prod-ref>`:

### `PAYSTACK_SECRET_KEY`
- **Usage:**
  - `paystack-webhook`: Computes HMAC-SHA512 hash of incoming raw webhook payloads to verify `x-paystack-signature`.
  - `paystack-verify`: Invokes Paystack REST API (`/transaction/verify/:reference`) for secondary transaction validation.
  - `paystack-init`: Interacts with Paystack initialization API.
- **Production Prefix:** Must start with `sk_live_`.
- **Security:** NEVER expose to client code or print to log streams.

### `CRON_SECRET`
- **Usage:**
  - `push-processor`: Checks incoming `Authorization: Bearer <token>` to verify invocation originated from the database `pg_cron` schedule or authorized admin.
- **Entropy Requirement:** High-entropy random string (at least 32 characters / 256 bits).

### `EXPO_ACCESS_TOKEN`
- **Usage:**
  - `push-processor`: Passed as `Authorization: Bearer <token>` to `https://exp.host/--/api/v2/push/send` to authenticate push notification dispatch under AY Pizza's Expo account.
- **Source:** Generated on [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens).

---

## 5. Staging vs. Production Environment Comparison

| Attribute | Staging Environment | Production Environment |
| :--- | :--- | :--- |
| **Supabase Project Ref** | `gmtlwewpblnnkzuwfcib` | Dedicated `ay-pizza-prod` ref |
| **App Environment (`EXPO_PUBLIC_APP_ENV`)** | `staging` | `production` |
| **Paystack Public Key** | `pk_test_...` | `pk_live_...` |
| **Paystack Secret Key** | `sk_test_...` | `sk_live_...` |
| **Webhook URL** | `https://gmtlwewpblnnkzuwfcib.supabase.co/functions/v1/paystack-webhook` | `https://<prod-ref>.supabase.co/functions/v1/paystack-webhook` |
| **Build Channel** | `staging` | `production` |
| **Database Data** | Test orders, sandbox payments, synthetic profiles | Clean baseline catalog only; real customer transactions |
