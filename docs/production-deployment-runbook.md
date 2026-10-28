# AY Pizza — Production Deployment Runbook

**Document Version:** 1.0.0  
**Target Project:** `ay-pizza-prod` (Dedicated Production Supabase Project)  
**Region:** `eu-west-1`  
**Mobile Identifier:** `ng.aypizza.app`  

---

## 1. Prerequisites Checklist

Before executing this runbook, ensure:
- [ ] You have access to Supabase CLI v2.117+ authenticated via `supabase login`.
- [ ] You have created the new Supabase production project and have its project reference.
- [ ] You have obtained verified **Live** Paystack credentials (`pk_live_...` and `sk_live_...`).
- [ ] You have authenticated EAS CLI via `npx eas-cli login`.
- [ ] You have reviewed [`docs/production-environment-variables.md`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/docs/production-environment-variables.md).

> [!CAUTION]
> Never link the production database to the staging project (`gmtlwewpblnnkzuwfcib`). Always explicitly specify the production project reference or verify `supabase status`.

---

## 2. Step-by-Step Deployment Procedure

### Step 1: Provision & Link the Production Supabase Project

1. Log into [Supabase Dashboard](https://supabase.com/dashboard) and click **New Project**.
   - **Organization:** Select your organization.
   - **Name:** `ay-pizza-prod`
   - **Database Password:** Generate and securely store a high-entropy password (24+ characters).
   - **Region:** `Europe (Ireland) - eu-west-1` (same as staging).
   - **Pricing Plan:** Pro tier recommended for production SLA, daily backups, and log retention.
2. Link the repository to the new production project:
   ```bash
   npx supabase link --project-ref <YOUR_PRODUCTION_PROJECT_REF>
   ```

---

### Step 2: Enable Required Database Extensions

In the Supabase Dashboard, navigate to **Database > Extensions** and enable:
1. `pg_net`: Enables asynchronous HTTP requests from SQL.
2. `pg_cron`: Enables cron-based job scheduling in PostgreSQL.

Alternatively, execute the following SQL via the Supabase SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
```

---

### Step 3: Apply All 15 Database Migrations

Push all sequentially ordered migrations from the local codebase to the production database:
```bash
npx supabase db push --linked
```

#### Verification:
Verify all 18 public tables have Row-Level Security enabled:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```
*Expected: 18 rows, all `rowsecurity = true`.*

Verify the catalog baseline was seeded:
```sql
SELECT count(*) FROM public.products WHERE is_available = true;
```
*Expected: At least 15 products.*

---

### Step 4: Configure Production Edge Function Secrets

Generate a secure 32-character random string for `CRON_SECRET`:
```bash
# Example generator in PowerShell:
$bytes = New-Object byte[] 32; (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes); [Convert]::ToBase64String($bytes)
```

Set the production server secrets:
```bash
npx supabase secrets set \
  PAYSTACK_SECRET_KEY=sk_live_YOUR_PAYSTACK_LIVE_SECRET_KEY \
  CRON_SECRET=YOUR_GENERATED_32_CHAR_CRON_SECRET \
  EXPO_ACCESS_TOKEN=YOUR_EXPO_PERSONAL_ACCESS_TOKEN \
  --project-ref <YOUR_PRODUCTION_PROJECT_REF>
```

> [!IMPORTANT]
> Never put `sk_live_*` into any `EXPO_PUBLIC_*` variable or local client files.

---

### Step 5: Deploy Production Edge Functions

Deploy all four Edge Functions without `--no-verify-jwt` (JWT authorization is enforced in code or gateway):
```bash
npx supabase functions deploy paystack-init --project-ref <YOUR_PRODUCTION_PROJECT_REF>
npx supabase functions deploy paystack-verify --project-ref <YOUR_PRODUCTION_PROJECT_REF>
npx supabase functions deploy paystack-webhook --no-verify-jwt --project-ref <YOUR_PRODUCTION_PROJECT_REF>
npx supabase functions deploy push-processor --no-verify-jwt --project-ref <YOUR_PRODUCTION_PROJECT_REF>
```

*Note: `paystack-webhook` and `push-processor` use custom authorization (Paystack HMAC-SHA512 header and Bearer `CRON_SECRET`), so Supabase API gateway JWT verification is disabled for them.*

---

### Step 6: Configure Paystack Live Dashboard

1. Log into [Paystack Dashboard](https://dashboard.paystack.com).
2. Ensure the dashboard is toggled to **Live Mode**.
3. Go to **Settings > API Keys & Webhooks**.
4. Set the **Live Webhook URL**:
   ```text
   https://<YOUR_PRODUCTION_PROJECT_REF>.supabase.co/functions/v1/paystack-webhook
   ```
5. Ensure the active settlement account is connected to AY Pizza's registered Nigerian commercial bank account.

---

### Step 7: Schedule the Push Notification Worker Cron

In the production Supabase SQL Editor, schedule the notification worker to process the outbox queue every minute:

```sql
SELECT cron.schedule(
    'process-push-notifications',
    '* * * * *',
    $$
    SELECT net.http_post(
        url := 'https://<YOUR_PRODUCTION_PROJECT_REF>.supabase.co/functions/v1/push-processor',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer YOUR_GENERATED_32_CHAR_CRON_SECRET'
        ),
        body := '{}'::jsonb
    );
    $$
);
```

#### Verification:
```sql
SELECT * FROM cron.job;
```
*Expected: 1 active job scheduled for `* * * * *`.*

---

### Step 8: Provision Initial Staff Accounts

Create initial restaurant staff in `auth.users` via Supabase Dashboard (**Authentication > Users > Add User**), then assign their staff roles in `public.profiles`:

```sql
-- Replace with the actual UUID generated by Supabase Auth:
UPDATE public.profiles
SET role = 'manager',
    display_name = 'Restaurant Manager'
WHERE id = '<MANAGER_USER_UUID>';

UPDATE public.profiles
SET role = 'kitchen',
    display_name = 'Kitchen Station 1'
WHERE id = '<KITCHEN_USER_UUID>';

UPDATE public.profiles
SET role = 'counter',
    display_name = 'Counter Station 1'
WHERE id = '<COUNTER_USER_UUID>';
```

---

### Step 9: Configure EAS Secrets for Production Mobile Builds

Configure the production build variables in EAS:
```bash
npx eas-cli secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value https://<YOUR_PRODUCTION_PROJECT_REF>.supabase.co --type string
npx eas-cli secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <YOUR_PRODUCTION_ANON_KEY> --type string
npx eas-cli secret:create --scope project --name EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY --value pk_live_YOUR_PAYSTACK_LIVE_KEY --type string
npx eas-cli secret:create --scope project --name EXPO_PUBLIC_APP_ENV --value production --type string
```

---

### Step 10: Produce Production Binaries

Trigger independent store builds via EAS:

#### Android App Bundle (.aab for Google Play):
```bash
npx eas-cli build --platform android --profile production
```

#### iOS Archive (.ipa for TestFlight / App Store):
```bash
npx eas-cli build --platform ios --profile production
```

---

### Step 11: Production Sanity Verification & Smoke Test

1. **Catalog Verification:** Launch app build; confirm all 13 pizzas, sizes, and UNILAG delivery landmarks load.
2. **Staff Login:** Log into the `/kds` screen with the provisioned kitchen staff account.
3. **Live Transaction Test:**
   - Execute a minimal live transaction (₦100 custom item or real test pizza).
   - Complete checkout with real live card or bank transfer.
   - Confirm immediate order transition to `CONFIRMED`.
   - Confirm order appears on KDS.
   - Process through kitchen to `DELIVERED`.

---

## 3. Rollback & Incident Recovery

### Edge Function Rollback:
If an Edge Function defect is detected post-deployment:
```bash
# Re-deploy known stable function version from git tag:
git checkout <PREVIOUS_COMMIT>
npx supabase functions deploy <FUNCTION_NAME> --project-ref <YOUR_PRODUCTION_PROJECT_REF>
git checkout -
```

### Emergency Payment Kill-Switch:
If live payment processing must be paused immediately without taking down the application:
1. In the Supabase SQL Editor, temporarily toggle the payment acceptance flag:
   ```sql
   UPDATE public.products SET is_available = false WHERE true;
   ```
   Or rotate `PAYSTACK_SECRET_KEY` in Supabase Secrets.
