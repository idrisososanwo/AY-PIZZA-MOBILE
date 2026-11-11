# AY PIZZA & ICE CREAM — PHASE 5.4.3 FINAL PRE-BUILD AUDIT
## Comprehensive Engineering, Security, Fulfilment & Integration Audit

**Project:** AY Pizza & Ice Cream Customer Mobile Application (`ng.aypizza.app`)  
**Phase:** 5.4.3 Final Pre-Build Gate  
**Date:** November 5, 2026  
**Auditor:** Senior Mobile & Backend Architecture Pair  
**Baseline Git Branch:** `checkpoint/phase-4-2-3-1` (HEAD: `b62cc67`)  
**Overall Readiness Verdict:** **BUILD READY FOR PHASE 5.4.3 STEP 5 (EAS PREVIEW BUILD)**

---

## 1. Executive Summary

This final pre-build engineering audit validates the technical integrity, database security, fulfilment display accuracy, and cross-functional regressions of the AY Pizza & Ice Cream mobile application following the completion of Phase 5.4.3 Steps 1–4.

### Scope of Audit
1. **Database Security Audit:** Verification of RPC functions (`transition_order_status`, `get_order_by_receipt`, `get_kds_orders`), execution grants across all role principals, state-machine trigger integrity (`handle_order_status_transition`), cancellation and refund automation, and historical `in_transit_at` data backfill.
2. **Fulfilment Display Audit:** End-to-end tracing of dynamic delivery and pickup pricing, landmark tariffs, zone travel durations, preparation estimates, empty-state guidance, and out-of-bounds boundary handling against actual configuration.
3. **Regression & Integration Audit:** Verification of authoritative pricing reconciliation, Paystack sandbox initialization, dual-track order tracking (pickup vs delivery), guest and authenticated address persistence, Android light-theme native input behavior, and preservation of the approved Concept 3 logo and all 23 food photography assets.
4. **Actionable Deliverables:** Read-only SQL Editor verification scripts for the developer to validate production and staging Supabase databases without altering operational state.

---

## 2. Database Security & Migration Audit

The migration `supabase/migrations/20261105000001_phase5_4_3_order_transit_tracking.sql` was audited for least-privilege access, SQL injection vectors, concurrency race conditions, and role-based operational permissions.

### 2.1 Function Security & Permissions Matrix

| Function Name | Security Model | Search Path | Public / Anon | Authenticated | Service Role | Purpose & Protection |
|:---|:---|:---|:---:|:---:|:---:|:---|
| `transition_order_status` | `SECURITY DEFINER` | `public, pg_temp` | **REVOKED** | **GRANTED** (RBAC Checked) | **GRANTED** | KDS order state-machine. Rejects anonymous callers; enforces staff role in `public.profiles`. |
| `get_kds_orders` | `SECURITY DEFINER` | `public, pg_temp` | **REVOKED** | **GRANTED** (RBAC Checked) | **GRANTED** | Kitchen display query. Strictly requires `staff`, `admin`, `kitchen`, `counter`, or `manager`. |
| `get_order_by_receipt` | `SECURITY DEFINER` | `public, pg_temp` | **ANON: GRANTED** (Token-Gated) | **GRANTED** | **GRANTED** | Customer receipt & tracking lookup. Gated by cryptographic SHA-256 receipt token hash OR order ownership. |
| `handle_order_status_transition` | `SECURITY DEFINER` | `public, pg_temp` | Trigger Only | Trigger Only | Trigger Only | Trigger function on `orders`. Appends immutable `order_status_events` & enqueues push notifications. |

#### Key Security Verifications:
- **No Unintended Permissions:** Anonymous callers (`anon`) and the general public (`PUBLIC`) are explicitly blocked from executing `transition_order_status` and `get_kds_orders`. Only authenticated staff and internal background service workers have access.
- **Search Path Hijacking Protection:** All functions explicitly set `SET search_path = public, pg_temp`, mitigating CVE-2018-1058 search path substitution vulnerabilities.
- **Concurrency & Re-entrancy Locks:** `transition_order_status` utilizes `SELECT * FROM public.orders WHERE id = p_order_id FOR UPDATE` to serialize concurrent status changes and detects version conflicts via `p_expected_current_status`.
- **Cryptographic Token Isolation:** `get_order_by_receipt` does not expose plaintext tokens; it digests incoming tokens via `digest(TRIM(p_receipt_token), 'sha256')` and matches against `orders.receipt_token_hash`.

### 2.2 Order Lifecycle & Transition Rule Enforcement

`transition_order_status` strictly differentiates between delivery and pickup lifecycles:

1. **Delivery Lifecycle Enforcement:**
   - `CONFIRMED` $\to$ `ACCEPTED` $\to$ `PREPARING` $\to$ `READY_FOR_PICKUP` (Staged for Courier) $\to$ `IN_TRANSIT` (Handed to Rider) $\to$ `DELIVERED` (Customer Received).
   - **Enforcement Rule:** When `v_order.fulfillment_type = 'delivery'`, an order in `READY_FOR_PICKUP` **cannot** transition directly to `DELIVERED`. It must transition to `IN_TRANSIT` first.
2. **Pickup Lifecycle Enforcement:**
   - `CONFIRMED` $\to$ `ACCEPTED` $\to$ `PREPARING` $\to$ `READY_FOR_PICKUP` (Hot at Counter) $\to$ `DELIVERED` (Collected by Customer).
   - **Enforcement Rule:** When `v_order.fulfillment_type = 'pickup'`, an order in `READY_FOR_PICKUP` **cannot** enter `IN_TRANSIT`. It transitions directly to `DELIVERED` upon physical handover.
3. **Role Authorization Enforcement:**
   - `kitchen` staff are blocked from cancelling/rejecting orders (`CANCELLED`) and from dispatching/handing over orders (`IN_TRANSIT`, `DELIVERED`).
   - `counter` staff are blocked from moving orders to oven preparation (`PREPARING`), which is reserved for kitchen personnel.
4. **Cancellation & Refund Automation:**
   - Cancelling an order requires a mandatory non-empty reason (`p_reason`).
   - If an order is cancelled from an active state (`CONFIRMED`, `ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `IN_TRANSIT`), `refund_status` is automatically set to `'REFUND_REQUIRED'`, and an immutable audit log is generated (`KDS_ORDER_CANCELLED_REFUND_REQUIRED`).

### 2.3 Status Event Trigger & Historical Backfill

- **Trigger Integrity:** Trigger `trg_order_status_transition` fires `AFTER UPDATE OF status ON public.orders` whenever `OLD.status IS DISTINCT FROM NEW.status`.
- **Audit Event Creation:** The trigger inserts a permanent record into `public.order_status_events` with contextual title, description, and metadata (including `fulfillment_type`, `landmark_name`, `refund_status`, `rejection_reason`).
- **Historical Backfill:** The migration executed:
  ```sql
  UPDATE public.orders o
  SET in_transit_at = sub.transit_time
  FROM (
      SELECT order_id, MIN(created_at) AS transit_time
      FROM public.order_status_events
      WHERE new_status = 'IN_TRANSIT'
      GROUP BY order_id
  ) sub
  WHERE o.id = sub.order_id AND o.in_transit_at IS NULL;
  ```
  This guarantees that past delivery orders accurately report their dispatch timestamps.

---

## 3. SQL Editor Verification Queries (Read-Only)

Developers can run the following read-only queries in the Supabase SQL Editor to verify the database state.

### Query 1: Verify Function Security, Definitions & Search Paths
```sql
-- 1. Check Function Security Configuration and Search Paths
SELECT 
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    p.prosecdef AS is_security_definer,
    p.proconfig AS runtime_configuration,
    pg_get_userbyid(p.proowner) AS function_owner
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
      'transition_order_status', 
      'get_order_by_receipt', 
      'get_kds_orders', 
      'handle_order_status_transition'
  )
ORDER BY p.proname;
```

### Query 2: Verify Execution Grants Across Role Principals
```sql
-- 2. Audit Execution Privileges for anon, authenticated, service_role, and public
SELECT 
    p.proname AS function_name,
    r.rolname AS principal,
    has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN (
    SELECT rolname FROM pg_roles WHERE rolname IN ('public', 'anon', 'authenticated', 'service_role')
) r
WHERE n.nspname = 'public'
  AND p.proname IN ('transition_order_status', 'get_order_by_receipt', 'get_kds_orders')
ORDER BY p.proname, r.rolname;
```
*Expected Output Checklist:*
- `transition_order_status`: `anon = FALSE`, `public = FALSE`, `authenticated = TRUE`, `service_role = TRUE`
- `get_kds_orders`: `anon = FALSE`, `public = FALSE`, `authenticated = TRUE`, `service_role = TRUE`
- `get_order_by_receipt`: `anon = TRUE`, `public = FALSE`, `authenticated = TRUE`, `service_role = TRUE`

### Query 3: Verify Status Transition Trigger & Index
```sql
-- 3. Check Order Status Trigger Status and Performance Index
SELECT 
    tgname AS trigger_name,
    tgenabled AS is_enabled, -- 'O' = Enabled, 'D' = Disabled
    pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.orders'::regclass
  AND tgname = 'trg_order_status_transition';

-- Verify in_transit_at index exists
SELECT 
    indexname, 
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'orders' 
  AND indexname = 'idx_orders_in_transit_at';
```

### Query 4: Verify Column Presence & Backfill Integrity
```sql
-- 4. Check in_transit_at Column Definition and Backfill Health
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'orders' 
  AND column_name = 'in_transit_at';

-- Unbackfilled Check: Must return 0
SELECT 
    COUNT(*) AS unbackfilled_orders_count
FROM (
    SELECT DISTINCT order_id 
    FROM public.order_status_events 
    WHERE new_status = 'IN_TRANSIT'
) e
JOIN public.orders o ON o.id = e.order_id
WHERE o.in_transit_at IS NULL;
```

### Query 5: Verify Recent Event Audit Logging & Cancellation Refunds
```sql
-- 5. Audit Sample of Order Status Events and Cancelled Order Refund States
SELECT 
    id, 
    order_id, 
    previous_status, 
    new_status, 
    title, 
    actor_type, 
    created_at
FROM public.order_status_events
ORDER BY created_at DESC
LIMIT 5;

SELECT 
    order_number, 
    status, 
    refund_status, 
    rejection_reason, 
    updated_at
FROM public.orders
WHERE status = 'CANCELLED'
ORDER BY updated_at DESC
LIMIT 5;
```

---

## 4. Fulfilment Display & Policy Audit

### 4.1 Trace of Dynamic Fulfilment Subtext on `HomeScreen.tsx`

| Fulfilment State | Selected Landmark | UI Display in Context Bar | Technical Source of Truth |
|:---|:---|:---|:---|
| **Delivery** | Campus (e.g. Inside School) | `₦500 Flat Campus Delivery • ~25–35 mins` | `selectedLandmark.fee`, `selectedLandmark.isCampus` |
| **Delivery** | Off-Campus (e.g. Surulere) | `₦3,500 (Surulere) • ~35–50 mins` | `selectedLandmark.fee`, `selectedLandmark.name` |
| **Delivery** | None Selected | `Select landmark for delivery fee & timing` | Fallback prompt; tapping triggers picker |
| **Pickup** | N/A (Kitchen Counter) | `Free Pickup • Ready for collection at King Jaja in ~15 mins` | `Brand.location.address`, ₦0 flat fee |

### 4.2 Comparison Against Actual Delivery Configuration

1. **Campus Delivery Fee:**
   - **Configured Tariff:** ₦500 (`Brand.fulfillment.campusDeliveryFee` and `PROVISIONAL_LANDMARKS[0].fee`).
   - **UI Representation:** `₦500 Flat Campus Delivery`.
   - **Policy Status:** **PROVISIONAL**. Derived from historical legacy web portal analysis. Awaiting owner sign-off per `docs/phase-5-4-owner-confirmation.md` (Decision Point 1).
2. **Off-Campus Delivery Fees:**
   - **Configured Tariffs:** 18 distinct mainland landmarks ranging from ₦1,000 (Akoka, Abule Oja) to ₦4,000 (Oworo, Gbagada, Ebute Metta).
   - **UI Representation:** Formatted dynamically: `₦{fee.toLocaleString()} ({name})`.
   - **Policy Status:** **PROVISIONAL**. Tariffs are fully database-configurable via `public.delivery_landmarks` and can be adjusted without client recompilation.
3. **Delivery Time Estimates:**
   - **Zone Engine Transit Times:**
     - Campus Zone: 15–25 minutes.
     - Inner Environs: 25–40 minutes.
     - Mid Environs: 30–50 minutes.
     - Outer Environs: 45–65 minutes.
   - **Home Screen Presentation:**
     - Campus: `~25–35 mins` (includes ~15 min baking + ~10 min bicycle courier delivery).
     - Off-Campus: `~35–50 mins` (includes ~15 min baking + ~20–35 min motorbike dispatch).
   - **Policy Status:** **OPERATIONAL ESTIMATE**. This is not an enforceable delivery SLA. The UI uses the tilde prefix (`~`) to denote an approximation.
4. **Pickup Readiness Time:**
   - **Engine Value:** 15–25 minutes.
   - **Home Screen Presentation:** `~15 mins`.
   - **Policy Status:** Represents baseline single-order oven bake time; kitchen queue depth during campus rush hours may extend this.
5. **Switching Between Pickup and Delivery:**
   - Toggling the segmented control immediately switches the context card between Pickup Stand and Delivery Destination, clears delivery fee for pickup, and updates cart subtotal/totals in real time.
6. **Delivery Out-of-Bounds & Service Closure Behavior:**
   - If distance exceeds 15 km (`maxDeliveryRadiusKm`): Delivery quote returns `isAvailable = false` ("Delivery is not available beyond 15 km from UNILAG kitchen... Please choose in-store pickup.").
   - If `is_delivery_active = false`: Returns "Delivery service is currently closed. Please choose in-store pickup."
   - In both cases, `CheckoutModal` disables the payment CTA and displays an explanatory blocker card.

---

## 5. Regression & Integration Audit

### 5.1 Verification Matrix

| Domain / Subsystem | Verification Method | Status | Notes |
|:---|:---|:---:|:---|
| **Authoritative Pricing** | `reconcileClientEstimateWithServer` & RPC | **PASS** | Prevents client-side price tampering. Discrepancies trigger `AuthoritativePriceDiscrepancyError`. |
| **Cart & Checkout Totals** | `CartView.tsx` & `CheckoutModal.tsx` | **PASS** | Subtotal, delivery fee, and grand total calculate consistently across both views. |
| **Order Receipt Display** | `OrderReceiptModal.tsx` | **PASS** | Migrated to Light Design System. White-on-white text bug resolved. 16.5:1 contrast achieved. |
| **Dual-Track Order Tracking** | `OrderTrackingModal.tsx` | **PASS** | Pickup shows 5-stage timeline; Delivery shows 6-stage timeline (including In Transit). |
| **Lifecycle Timestamps** | `order-tracking-service.ts` | **PASS** | Shows factual recorded timestamps (`clock_timestamp()`); no fake predictive times. |
| **Paystack Sandbox Checkout** | `PaystackPaymentModal.tsx` | **PASS** | Initializes via test public key. High-contrast Paystack modal header and close button verified. |
| **Navigation & RBAC** | `App.tsx` & `BottomTabBar.tsx` | **PASS** | 4-tab bar has $\ge 48\text{dp}$ touch targets. `/kitchen` is strictly protected by role checks. |
| **Address Management** | `SavedAddressesModal.tsx` | **PASS** | Supports authenticated PostgreSQL storage and guest device-isolated `AsyncStorage`. |
| **Android Light Theme** | `app.json` (`userInterfaceStyle: "light"`) | **PASS** | White inputs with charcoal text; explicit `selectionColor={Colors.primaryRed}` across all inputs. |
| **Catalog Food Photography** | `src/constants/images.ts` | **PASS** | All 23 seeded catalog products map to dedicated production WebP assets. |
| **Concept 3 Brand Logo** | `BrandedLaunchScreen.tsx` | **PASS** | Exact master Concept 3 monogram and concentric rings preserved without regression. |

---

## 6. Pre-Build Quality Gates

| Quality Gate | Command | Baseline | Current Result | Verdict |
|:---|:---|:---:|:---:|:---:|
| **Jest Automated Tests** | `npm test` | 495 / 495 passed | **522 / 522 passed** (35 suites) | **PASS** |
| **Step 4 Regression Tests** | `npm test src/__tests__/phase5-4-3-step4-visual-harmonisation.test.ts` | N/A (New) | **27 / 27 passed** (100%) | **PASS** |
| **TypeScript Compilation** | `npx tsc --noEmit` | 0 errors | **0 errors** | **PASS** |
| **ESLint Quality Check** | `npx expo lint` | 45 warnings | **0 errors, 44 warnings** | **PASS** |
| **Expo Doctor Audit** | `npx expo-doctor` | 20 / 20 passed | **20 / 20 checks passed** | **PASS** |

---

## 7. Fulfilment Policy Discrepancies & Business Assumptions

The table below catalogs provisional engineering assumptions currently in the application code that require formal owner confirmation prior to final public app-store release:

| Area | Current Technical Default | Status / Risk | Recommended Owner Decision |
|:---|:---|:---|:---|
| **Campus Delivery Tariff** | ₦500 flat | **PROVISIONAL** — In line with student expectations, but fuel/courier margins must be confirmed. | Confirm ₦500 or adjust in `public.delivery_landmarks`. |
| **Off-Campus Tariffs (18 Areas)** | ₦1,000 to ₦4,000 | **PROVISIONAL** — Extracted from legacy web portal. Long-distance dispatch (Oworo/Gbagada) carries traffic delays. | Confirm tariffs in `docs/phase-5-4-owner-confirmation.md`. |
| **Delivery Radius** | 15.0 km | **PROVISIONAL** — Excludes Island to protect pizza temperature. | Confirm 15.0 km limit or tighten to 10.0 km. |
| **Free Delivery Threshold** | Disabled (`NULL`) | **TECHNICAL DEFAULT** — Standard for Nigerian quick-service restaurants. | Confirm whether orders over ₦25,000 get free delivery. |
| **Minimum Order Value** | None (₦0) | **TECHNICAL DEFAULT** — Allows ordering single drinks/sides. | Consider ₦3,000 minimum for off-campus deliveries. |
| **Delivery Time Estimates** | ~25–35 mins (Campus) / ~35–50 mins (Off-Campus) | **APPROXIMATION** — Communicated with `~` prefix to prevent breach of contract claims. | Retain as advisory estimates; do not promise strict SLAs. |

---

## 8. Integration Risks & Mitigation

1. **Risk: Courier Skip Transition:** In delivery mode, if staff attempt to click "Delivered" while the order is in `READY_FOR_PICKUP`, the database RPC will reject the call (`INVALID_TRANSITION`).
   - *Mitigation:* The KDS UI and staff operational flow have been aligned to display the "Dispatch to Courier 🛵" button first, preventing staff from skipping `IN_TRANSIT`.
2. **Risk: Network Flaps During Realtime Tracking:** WebSocket disconnection on mobile cellular connections could cause customers to miss the `IN_TRANSIT` status notification.
   - *Mitigation:* `OrderTrackingService` features automated polling fallback (every 10 seconds), authoritative refetching on reconnect, and monotonic version reconciliation.
3. **Risk: Guest Order Tracking Token Loss:** If a guest user closes the app or clears memory, they might lose access to their active order receipt token.
   - *Mitigation:* Confirmed guest receipt tokens are automatically persisted to hardware-backed `SecureStore` and local `AsyncStorage` immediately upon payment confirmation.

---

## 9. Final Recommendation

### **VERDICT: BUILD READY**

The codebase is fully stable, robustly tested, visually harmonised, and secure. There are **zero blocking technical issues**. 

Proceed directly with **Phase 5.4.3 Step 5: Android Preview Build via EAS**, maintaining the following production safeguards:
- Use EAS `--freeze-credentials` to preserve keystore integrity.
- Maintain Paystack sandbox testing parameters.
- Verify the generated preview APK on the physical Xiaomi Redmi 13C test device.

