# Phase 4.1.2: Final Database Security and Operational Verification Report

**Project:** AY Pizza Production-Ready Customer Mobile Application  
**Target Business:** AY Pizza, Opposite King Jaja Hall, University of Lagos (UNILAG), Akoka, Lagos, Nigeria  
**Scope:** Final adversarial verification of Phase 4.1 and Phase 4.1.1.  
**Review Status:** Audited, Tested, Documented & Classified. **Phase 4.2 has NOT been started.**  
**Date:** October 22, 2026  

---

## 1. Executive Verdict

Phase 4.1 (Kitchen Display System & Staff Operations) and Phase 4.1.1 (Adversarial Hardening) have been subjected to an exhaustive, evidence-driven security, database, and operational review.

### Key Verdict Summary
1. **RPC Authorization & Role Isolation (Hardened):**  
   The database-level RPCs `public.transition_order_status` and `public.get_kds_orders` enforce strict caller authentication. `EXECUTE` is explicitly revoked from `PUBLIC` and `anon`. Anonymous callers are rejected with `UNAUTHENTICATED`, and `customer` and `rider` callers are rejected with `FORBIDDEN`.
2. **State Machine & Fulfillment Bifurcation (Enforced):**  
   Pickup and delivery workflows strictly diverge in PostgreSQL: pickup orders cannot enter `IN_TRANSIT`, and delivery orders cannot bypass `IN_TRANSIT` to reach `DELIVERED`.
3. **Refund Liability Integrity (Isolated):**  
   Cancelling or rejecting a paid order flags `refund_status = 'REFUND_REQUIRED'` and records an immutable audit log entry without mutating payment ledgers, amounts, or transaction references. Automated Paystack API refund execution is intentionally absent; all refunds require authorized administrative review.
4. **Monotonic Version Concurrency (Protected):**  
   `orders.version` increments monotonically on every status transition, preventing stale or out-of-order Realtime WebSocket events from corrupting client state.
5. **Critical Finding Identified (Remediation Proposed):**  
   `SECURITY DEFINER` functions `transition_order_status()` and `get_kds_orders()` in migration `20261022000006_phase4_1_1_adversarial_hardening.sql` omitted the explicit clause `SET search_path = public, pg_temp;`. A minimal hardening migration is specified for owner approval.
6. **Build & Route Finding Identified:**  
   `App.tsx` renders the KDS tab in the main customer navigation bar, and `react-dom`/`react-native-web` are not installed in `package.json`, preventing web export (`npx expo export -p web`). Native Android export succeeded (`npx expo export -p android`).

---

## 2. Actual Migrations and Functions Inspected

The following PostgreSQL migrations and functions were inspected line-by-line:

| Migration File | Primary Objects Inspected | Security Verification Scope |
| :--- | :--- | :--- |
| `20261021000001_initial_schema.sql` | `profiles`, `orders`, `order_items`, `customer_addresses`, `audit_logs` | Baseline RLS policies, table schemas, and `is_staff_or_admin()` function |
| `20261021000003_security_and_integrity_fixes.sql` | `prevent_role_self_escalation()`, `reject_audit_tampering()` | Profile anti-escalation trigger and audit log immutability triggers |
| `20261021000005_phase3_checkout_and_paystack.sql` | `create_order_authoritative()`, `orders` RLS | Zero-direct-client-insert policy (`Staff only direct insert orders`) |
| `20261021000006_phase3_1_security_verification.sql` | `get_order_by_receipt()`, `orders.receipt_token_hash` | SHA-256 hash storage at rest and token verification RPC |
| `20261022000005_phase4_1_kds_and_staff_operations.sql` | `order_status`, `user_role`, `transition_order_status()`, `get_kds_orders()` | KDS operational schema additions, status progression, and initial KDS RPCs |
| `20261022000006_phase4_1_1_adversarial_hardening.sql` | `orders.version`, `orders.refund_status`, hardened `transition_order_status()`, hardened `get_kds_orders()` | Granular RBAC, anonymous caller rejection, workflow bifurcation, refund liability, and grant revocations |

### Detailed Line-by-Line Findings:

#### 1. Identity & Role Derivation
In [20261022000006_phase4_1_1_adversarial_hardening.sql](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261022000006_phase4_1_1_adversarial_hardening.sql#L44-L73):
- Line 44: `v_caller_id := auth.uid();` derives identity directly from trusted Supabase Auth context.
- Lines 58-60: `SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;` queries the authoritative database role, completely ignoring client-provided parameters.

#### 2. Caller Rejection (Customer & Rider)
In [20261022000006_phase4_1_1_adversarial_hardening.sql](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261022000006_phase4_1_1_adversarial_hardening.sql#L63-L69):
- Lines 63-69:
  ```sql
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('staff', 'admin', 'kitchen', 'counter', 'manager') THEN
      RETURN jsonb_build_object(
          'success', false,
          'code', 'FORBIDDEN',
          'message', 'Caller lacks staff permissions for KDS operations.'
      );
  END IF;
  ```
- Customers and riders are completely blocked from executing operational transitions.

#### 3. Explicit Grant Revocations
In [20261022000006_phase4_1_1_adversarial_hardening.sql](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261022000006_phase4_1_1_adversarial_hardening.sql#L407-L412):
- Lines 407-408:
  ```sql
  REVOKE ALL ON FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status) TO authenticated, service_role;
  ```
- Lines 410-411:
  ```sql
  REVOKE ALL ON FUNCTION public.get_kds_orders(public.order_status[]) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_kds_orders(public.order_status[]) TO authenticated, service_role;
  ```

#### 4. Service-Role Impersonation Protection
- Line 45: `v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');`
- In Supabase / PostgREST, `request.jwt.claim.*` settings are populated solely by the PostgREST server from a verified, cryptographically signed JWT. Untrusted clients cannot inject or override this setting without possessing the Supabase JWT secret key.

#### 5. SECURITY DEFINER Search Path Audit (Finding)
- Lines 28-35 & 314: `transition_order_status` is declared as `$$ LANGUAGE plpgsql SECURITY DEFINER;` without a `SET search_path = public, pg_temp;` clause.
- Lines 317-320 & 404: `get_kds_orders` is declared as `$$ LANGUAGE plpgsql SECURITY DEFINER;` without a `SET search_path = public, pg_temp;` clause.
- **Risk:** In PostgreSQL, omitting `search_path` on `SECURITY DEFINER` functions permits potential search path manipulation (CWE-426). This issue is formally classified in Section 9.

#### 6. Service-Role Order Validation Bypass Audit
- When `v_is_service_role` is true, `v_caller_role` is set to `'admin'` (line 72).
- The function continues through all validation blocks: row locking (`FOR UPDATE`, line 79), concurrency checks (line 90), unpaid status checks (line 101), terminal state checks (line 111), cancellation reasons (line 242), refund liability assignment (line 254), version incrementing (line 261), and audit logging (lines 274-301).
- **Result:** Service-role callers CANNOT bypass state machine invariants or audit logging.

#### 7. Customer Data Isolation
In [20261021000001_initial_schema.sql](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261021000001_initial_schema.sql#L416-L427):
- Lines 416-417 (`customer_addresses`):
  `CREATE POLICY "Users manage own addresses" ON public.customer_addresses FOR ALL USING (auth.uid() = customer_id);`
  Zero cross-user access.
- Lines 423-427 (`orders`):
  `CREATE POLICY "Customers view own orders" ON public.orders FOR SELECT USING ((auth.uid() IS NOT NULL AND auth.uid() = customer_id) OR public.is_staff_or_admin());`
  Customers can only read orders where `customer_id = auth.uid()`. Unrelated records return zero rows.

---

## 3. Permission Matrix with Database Evidence

| Role | View KDS Orders | Accept (`ACCEPTED`) | Reject (`CANCELLED`) | Bake (`PREPARING`) | Ready (`READY_FOR_PICKUP`) | Dispatch (`IN_TRANSIT`) | Handover (`DELIVERED`) | Add Staff Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **KITCHEN** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **COUNTER** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (Delivery) | ✅ (Pickup) | ✅ |
| **MANAGER** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **ADMIN** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **CUSTOMER**| ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **RIDER** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Exact Database Evidence:
1. **Kitchen Cancellation Block:**
   `20261022000006_phase4_1_1_adversarial_hardening.sql:131-137`:
   `IF p_target_status = 'CANCELLED' AND v_caller_role = 'kitchen' THEN RETURN jsonb_build_object('success', false, 'code', 'ROLE_UNAUTHORIZED', 'message', 'Kitchen staff cannot cancel or reject orders. Counter or Manager authorization required.');`
2. **Kitchen Dispatch & Handover Block:**
   `20261022000006_phase4_1_1_adversarial_hardening.sql:149-155`:
   `IF p_target_status IN ('IN_TRANSIT', 'DELIVERED') AND v_caller_role = 'kitchen' THEN RETURN jsonb_build_object('success', false, 'code', 'ROLE_UNAUTHORIZED', 'message', 'Kitchen staff cannot perform dispatch or customer handover operations.');`
3. **Counter Baking Block:**
   `20261022000006_phase4_1_1_adversarial_hardening.sql:140-146`:
   `IF p_target_status = 'PREPARING' AND v_caller_role = 'counter' THEN RETURN jsonb_build_object('success', false, 'code', 'ROLE_UNAUTHORIZED', 'message', 'Counter staff cannot start kitchen preparation. Kitchen staff authorization required.');`
4. **Customer / Rider RPC Block:**
   `20261022000006_phase4_1_1_adversarial_hardening.sql:63-69`:
   `IF v_caller_role IS NULL OR v_caller_role NOT IN ('staff', 'admin', 'kitchen', 'counter', 'manager') THEN RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Caller lacks staff permissions for KDS operations.');`

---

## 4. Actual Database / RLS Test Results & Execution Environment

### Critical Environment Disclosure
In accordance with instructions to determine whether tests execute against mocks or a live PostgreSQL database:
- **Test Framework:** Node.js v25.1.0 with Jest v30.5.2 and `ts-jest` v29.4.15.
- **Client Mocking:** All 204 automated tests in `src/__tests__/` mock the Supabase client (`jest.mock('../config/supabase')`) and validate client-side domain rules, optimistic rollback, version deduplication, and expected database return contracts.
- **Host Database Status:**
  - Neither Docker nor Podman is installed on this host (`docker: command not found`).
  - Local PostgreSQL port 5432 is not running (TCP probe to `127.0.0.1:5432` failed / timed out).
  - Therefore, live multi-session PostgreSQL integration tests against an active database could **not** be executed in this environment.
- **Labeling Standard:** In strict adherence to project guidelines, mocked tests are explicitly labeled as **Unit / Client Integration Tests**, NOT live database integration tests.

---

## 5. Refund Lifecycle Limitations & Paystack Absence

### Implementation Verification
1. **Unpaid Orders (`DRAFT`, `PENDING_PAYMENT`):**
   - Cannot be processed by `transition_order_status()`.
   - If cancelled at creation time, `refund_status` defaults to `'NOT_APPLICABLE'`.
2. **Paid Orders (`CONFIRMED`, `ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `IN_TRANSIT`):`
   - When cancelled by counter/manager staff, `orders.refund_status` is updated to `'REFUND_REQUIRED'` (`20261022000006_phase4_1_1_adversarial_hardening.sql:254-256`).
   - Audit entry is logged as `'KDS_ORDER_CANCELLED_REFUND_REQUIRED'`.
3. **Financial Immutability:**
   - The original `subtotal`, `delivery_fee`, `total`, and `payment_reference` on `orders` remain completely unchanged.
   - The corresponding record in `payment_transactions` remains in `status = 'success'`.
4. **Duplicate Cancellation Protection:**
   - Re-cancelling an order returns `code: 'ALREADY_CANCELLED'` (`line 120-127`), preventing duplicate audit log entries or duplicate refund status transitions.
5. **Absence of Paystack Refund API:**
   - The codebase does **NOT** contain any integration with Paystack's Refund API (`POST https://api.paystack.co/refund`).
   - `REFUND_PENDING` and `REFUNDED` states in `public.orders` cannot be triggered by client actions.
   - **Operational Standard:** `REFUND_REQUIRED` serves strictly as an internal marker alerting store managers to manually review and issue the refund through the Paystack Merchant Dashboard. Setting `refund_status` to `REFUNDED` is reserved for manual administrative reconciliation and does **not** constitute cryptographic proof of refund completion.

---

## 6. Delivery and Pickup Handover Responsibility

### Handover Protocol (Opposite King Jaja Hall)
1. **Counter Pickup Workflow:**
   - Transition: `READY_FOR_PICKUP → DELIVERED`.
   - **Authorized Roles:** `counter`, `manager`, `admin`.
   - **Operational Evidence:** Physical presentation by the student/customer of the order receipt screen or matching 4-digit order suffix at the pickup counter.
2. **Hostel Delivery Workflow:**
   - Stage 1: `READY_FOR_PICKUP → IN_TRANSIT`.
     - **Authorized Roles:** `counter`, `manager`, `admin`.
     - **Operational Evidence:** Handing the boxed pizza to an AY Pizza dispatch rider at the dispatch station.
   - Stage 2: `IN_TRANSIT → DELIVERED`.
     - **Authorized Roles:** `counter`, `manager`, `admin` (or rider via dispatch desk).
     - **Operational Evidence:** Manual operational confirmation (rider returns to station or calls desk confirming handover at Jaja Hall, Mariere, Moremi, or other hostel porters' lodges).
3. **Absence of GPS / Telemetry:**
   - There is NO automated GPS, rider geolocation, or electronic proof-of-delivery (POD) tracking. Staff actions are purely manual operational milestone logs.

---

## 7. KDS Production Build & Route Verification

### 1. Build Verification
- **Android Production Bundle:**  
  Executed `npx expo export -p android`. Bundling succeeded cleanly in 78,131ms, generating `_expo/static/js/android/index-e1f159432b2745ed94c578501694974f.hbc` (2.4MB) in `dist/`.
- **Web Export Diagnostic:**  
  Executed `npx expo export -p web`. Failed with:
  `CommandError: It looks like you're trying to use web support but don't have the required dependencies installed. Install react-dom@19.3.0, react-native-web@^0.21.4 by running: npx expo install react-dom react-native-web`.
  Identified as a production-launch dependency.

### 2. Route Separation & Role Simulation
- In [KitchenDisplaySystem.tsx](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/KitchenDisplaySystem.tsx#L16-L20), the role switcher is wrapped in `isDev = typeof __DEV__ !== 'undefined' && __DEV__`. In production builds, the switcher is omitted and replaced with a static read-only badge (`ROLE: {currentRole.toUpperCase()}`).
- In [App.tsx](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/App.tsx#L289-L297), the `👨‍🍳 Kitchen KDS` button is currently visible in the top navigation tab bar of the unified app entry point. In production, this tab should be restricted to authenticated staff or isolated behind `/kitchen`.

---

## 8. Privacy & Realtime Reliability

1. **Staff Privacy Masking:**
   - Kitchen tickets omit customer phone numbers and hostel room details, displaying only first name, delivery landmark, items, customizations, and kitchen notes.
   - Dispatch tickets (counter) include phone numbers and delivery notes for handover coordination.
2. **Realtime Monotonic Versioning:**
   - Every mutation increments `orders.version`.
   - `kds-service.ts` inspects `newRecord.version <= existing.version` and discards stale or out-of-order payloads.
3. **Atomic Serialization:**
   - PostgreSQL row locks (`SELECT ... FOR UPDATE`) serialize status updates. Concurrent conflicting transitions return `CONCURRENT_MODIFICATION` rather than corrupting ticket status.
4. **Cross-Platform Audio & Vibration:**
   - Web uses Web Audio API (`window.AudioContext`) with oscillator chime.
   - Native devices use double-pulse vibration fallback (`Vibration.vibrate([0, 200, 80, 200])`).

---

## 9. Remaining Defects & Production-Launch Dependencies

Every identified issue is classified according to risk:

| ID | Issue | Severity Classification | Description | Required Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | Missing `SET search_path = public, pg_temp` in KDS RPCs | **High-Priority Issue** | `transition_order_status` and `get_kds_orders` are `SECURITY DEFINER` functions without an explicit search_path (CWE-426). | Apply proposed minimal hardening migration adding `SET search_path = public, pg_temp` to both functions. |
| **DEF-02** | Missing `react-dom` & `react-native-web` for Web KDS Export | **Production-Launch Dependency** | `package.json` lacks web dependencies, causing `npx expo export -p web` to fail. | Run `npx expo install react-dom react-native-web` prior to kitchen tablet web deployment. |
| **DEF-03** | KDS Tab Exposed in Customer Mobile UI | **Production-Launch Dependency** | `App.tsx` tab bar contains `👨‍🍳 Kitchen KDS` unconditionally. | Gate tab visibility with staff authentication (`userRole in ['kitchen', 'counter', 'manager', 'admin']`) or separate web entry point `/kitchen`. |
| **DEF-04** | Live Database Test Execution Gap | **Production-Launch Dependency** | Tests ran with mocked Supabase client due to absence of local Docker / PostgreSQL host. | Execute migration suite and multi-user integration tests against a live Supabase staging project before launch. |
| **DEF-05** | Paystack Refund API Integration Absence | **Accepted Limitation** | No automated refund execution via Paystack API exists; cancellations only record `REFUND_REQUIRED`. | Store manager manually processes refunds on Paystack dashboard; documented operational limitation. |
| **DEF-06** | Manual Delivery Confirmation | **Accepted Limitation** | No GPS or electronic proof-of-delivery tracking exists; delivery milestones are reported manually by staff/riders. | Documented operational boundary (Phase 4.1). |

---

## 10. Test Classification & Final Execution Evidence

| Test Suite / Command | Test Type | Execution Environment | Executed Result | Evidence File / Output Reference |
| :--- | :--- | :--- | :--- | :--- |
| **Automated Unit & Domain Tests** | Unit / Mock Integration | Node.js v25.1.0 / Jest v30.5.2 | **PASS** (204/204 tests, 16 suites) | `PASS src/__tests__/phase4-1-1-kds-adversarial-verification.test.ts (23.641 s)` |
| **TypeScript Static Check** | Compiler Typecheck | TypeScript v6.0.3 (`npx tsc --noEmit`) | **PASS** (0 errors) | Command exited with code 0 |
| **Expo Health Diagnostic** | Dependency & Config Diagnostic | Expo CLI (`npx expo-doctor`) | **PASS** (20/20 checks passed) | `Running 20 checks on your project... 20/20 checks passed.` |
| **Android Bundle Export** | Production Build Verification | Metro Bundler (`npx expo export -p android`) | **PASS** (Exported: dist) | `Android Bundled 78131ms index.ts (692 modules) -> index-e1f159432b2745ed94c578501694974f.hbc (2.4MB)` |
| **Web Bundle Export** | Production Build Verification | Metro Bundler (`npx expo export -p web`) | **FAIL** (Missing web packages) | `CommandError: It looks like you're trying to use web support but don't have the required dependencies installed.` |
| **Live Database RLS / RPC Tests** | Live PostgreSQL Integration | Host Environment (No Docker / PG port 5432 closed) | **NOT RUN** (Docker unavailable) | Transparently disclosed in Section 4. |

---

## 11. Proposed Minimal Correction for Owner Approval

To resolve **DEF-01** (Missing `search_path` on `SECURITY DEFINER` functions), the following minimal SQL patch is proposed for owner approval:

```sql
-- Migration Proposal: 20261022000007_phase4_1_2_search_path_hardening.sql
ALTER FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status)
    SET search_path = public, pg_temp;

ALTER FUNCTION public.get_kds_orders(public.order_status[])
    SET search_path = public, pg_temp;
```

---

## 12. Strict Phase Boundary Confirmation

In strict compliance with project rules:
- **Phase 4.1.2 audit and verification is complete.**
- **Phase 4.2 has NOT been started.**
- No GPS tracking, rider mobile apps, push notifications, customer loyalty systems, SMS OTP recovery, or external payment integrations were created.
- The project is halted awaiting restaurant owner review and authorization.
