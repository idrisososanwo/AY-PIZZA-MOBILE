# Security Architecture & Data Protection: AY Pizza Mobile

**Project:** AY Pizza Production-Ready Mobile Ordering System  
**Phase:** Phase 1.1 Foundation Security and Data Integrity Review  
**Standards:** OWASP Mobile Top 10, PCI-DSS Level 4 via Paystack Tokenization, NDPR (Nigeria Data Protection Regulation)  
**Date:** October 21, 2026  
**Review Status:** Audited, Hardened & Verified  

---

## 1. Focused Security Review Findings & Classification

During the Phase 1.1 focused engineering review, the codebase, SQL migrations, and RLS policies were subjected to an adversarial audit. The following vulnerabilities were identified and resolved:

| ID | Finding | Classification | Status in Phase 1.0 | Resolution in Phase 1.1 |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **Profile Role Self-Escalation** | **CRITICAL** | The policy `"Users can update own profile"` allowed users to update their own row without restricting the `role` column, enabling a customer to promote themselves to `admin`. | **RESOLVED:** Created PostgreSQL trigger `prevent_role_self_escalation()` that aborts any transaction altering the `role` column unless executed by an administrator (`public.is_admin()`). |
| **SEC-02** | **Client-Authoritative Order Total Bypass** | **CRITICAL** | `order-calculator.ts` is bundled into the React Native client. The initial table policy `"Allow order creation"` had `WITH CHECK (TRUE)`, which would permit a crafted client request to insert arbitrary totals or `status = 'PAID'`. | **RESOLVED:** Created database function `public.create_order_authoritative()` that recalculates line items directly from database prices. Replaced order creation policy with `"Secure order creation"` enforcing `status = 'PENDING_PAYMENT'`. |
| **SEC-03** | **Unrestricted Child Record Access on Customizations** | **HIGH** | `order_item_customizations` policy allowed public SELECT/INSERT (`USING (TRUE)`), permitting enumeration of all customer customization details. | **RESOLVED:** Enforced parent order ownership traversal across `order_items` and `orders`. Only the order owner or staff can view customizations. |
| **SEC-04** | **Unverified Dietary Assumption Enforcement** | **MEDIUM** | Strict rejection of pork/bacon/alcohol was hardcoded into catalog validation based on an unconfirmed assumption. | **RESOLVED:** Converted dietary policy to **configurable and provisional**. Enforcement is disabled by default until explicit confirmation from the restaurant owner. |
| **SEC-05** | **Provisional Catalog & Delivery Rate Labeling** | **MEDIUM** | Reverse-engineered prices and landmark delivery fees were described as verified rather than provisional. | **RESOLVED:** Formally classified all seeded prices and fees as **provisional estimates**. Made all rates dynamically editable in PostgreSQL by administrators. |
| **SEC-06** | **Audit Log Forgery & Tampering Risk** | **MEDIUM** | Initial RLS allowed arbitrary inserts to `audit_logs` without verifying caller identity. | **RESOLVED:** Restricted audit log insertion to staff/admin and trusted functions; added trigger `reject_audit_tampering()` denying any `UPDATE` or `DELETE`. |
| **SEC-07** | **Customization Option Injection Bypass** | **CRITICAL** | `create_order_authoritative()` only checked if `option_id` existed in `customization_options`, allowing clients to inject dessert toppings into pizzas or arbitrary options across categories. | **RESOLVED (Phase 3.1):** Enforced relational join against `product_customization_groups` and `category_slug`, verifying options belong to valid groups assigned to the specific product, with `is_available = TRUE`. |
| **SEC-08** | **Cross-Product Size Injection** | **HIGH** | `create_order_authoritative()` validated size existence without verifying product association, permitting milkshake or ice cream size IDs to be submitted for pizzas. | **RESOLVED (Phase 3.1):** Enforced `ps.product_id = v_prod.id OR ps.category_slug = v_prod.category_slug`. |
| **SEC-09** | **Excessive Privileges on `settle_order_payment`** | **CRITICAL** | `settle_order_payment` was granted EXECUTE to `anon` and `authenticated`, allowing direct client RPC calls to mark orders as CONFIRMED without paying. | **RESOLVED (Phase 3.1):** Revoked EXECUTE from `PUBLIC, anon, authenticated`. Granted EXECUTE exclusively to `service_role`. |
| **SEC-10** | **Plaintext Bearer Receipt Token Exposure at Rest** | **HIGH** | `receipt_token` was stored in plaintext in `orders`, creating a bearer credential compromise risk if database dumps or read replicas were breached. | **RESOLVED (Phase 3.1):** Migrated to `receipt_token_hash` (SHA-256) at rest. Verification hashes incoming token before comparison; token plaintext is dropped from database columns. |
| **SEC-11** | **HMAC Timing Side-Channel in Webhook** | **MEDIUM** | Webhook compared HMAC signature using standard JavaScript equality (`!==`), susceptible to timing side-channel attacks. | **RESOLVED (Phase 3.1):** Implemented constant-time XOR comparison (`timingSafeEqual()`). |
| **SEC-12** | **Single-Point-of-Trust Webhook Processing** | **HIGH** | Webhook relied solely on incoming webhook payload without verifying transaction authenticity with Paystack ledger. | **RESOLVED (Phase 3.1):** Enforced dual-verification: Webhook independently invokes Paystack REST API `GET /transaction/verify/:reference` before database settlement. |
| **SEC-13** | **Uncontrolled Payment Initialization & Attempt Sprawl** | **MEDIUM** | Each initialization call created a new Paystack reference even if an active attempt was already pending. | **RESOLVED (Phase 3.1):** Reuses active initialized payment attempt (<15 min) and rejects initialization if order is already paid/confirmed. |
| **SEC-14** | **Undetected Multi-Charge & Cancelled Order Payment** | **HIGH** | Second successful charge on same order or payment on cancelled order was not flagged. | **RESOLVED (Phase 3.1):** Hardened state machine logs `DUPLICATE_PAYMENT_DETECTED` and `PAYMENT_RECEIVED_ON_CANCELLED_ORDER` for immediate manual merchant refund. |
| **SEC-15** | **Receipt Token Cryptographic Derivability via Static Salt KDF** | **CRITICAL** | `v_receipt_token := encode(hmac(idempotency_key, salt, 'sha256'), 'hex')` allowed anyone knowing the idempotency key (stored in plaintext in DB) and static salt to derive the bearer receipt token. | **RESOLVED (Phase 3.1.1):** Replaced deterministic KDF with CSPRNG `gen_random_bytes(32)`. Plaintext token exists only in server memory for caller; only SHA-256 hash stored at rest. |
| **SEC-16** | **Guest Receipt Credential Volatility & Insecure Local Storage** | **HIGH** | Plaintext tokens held only in ephemeral React state were lost on app restart or network drop during checkout; writing to `AsyncStorage` would expose credentials in unencrypted sandbox dumps. | **RESOLVED (Phase 3.1.2):** Implemented `GuestReceiptStore` with `expo-secure-store` (iOS Keychain / Android KeyStore AES). Enforced zero-AsyncStorage and zero-log exposure. |
| **SEC-17** | **Payment Initialization Concurrency Race Condition** | **HIGH** | Concurrent initialization requests for the same order created multiple active Paystack sessions and distinct references. | **RESOLVED (Phase 3.1.2):** Created partial unique index `idx_single_active_initialized_payment_per_order` on `payment_transactions(order_id) WHERE status = 'initialized'` and implemented `begin_or_reuse_payment_attempt()` with `SELECT ... FOR UPDATE` row-level locking. |
| **SEC-18** | **External Payment Provider Initialization Race (Orphaned Sessions)** | **HIGH** | While the DB unique index prevented two initialized rows, it did not prevent two concurrent requests from both reaching the external Paystack API before either inserted a record, generating multiple external payable transactions. | **RESOLVED (Phase 3.1.3):** Implemented a database-backed two-phase reservation pattern. Worker atomically inserts `status = 'initiating'` before contacting Paystack. Partial unique index on `status IN ('initiating', 'initialized')` prevents concurrent workers from calling Paystack; in-flight requests poll for the winner's result. |
| **SEC-19** | **Ambiguous Provider Outcome & Session Sprawl on Timeout** | **HIGH** | Treating network timeouts or dropped responses as definitive failures allowed subsequent retries to generate new Paystack references when Paystack had already created a payable transaction. | **RESOLVED (Phase 3.1.4):** Introduced `requires_reconciliation` state and extended the partial unique index to cover `status IN ('initiating', 'requires_reconciliation', 'initialized')`. Stale reservations and timeouts undergo mandatory REST reconciliation (`GET /transaction/verify/:reference`) before any replacement reference can be generated. |
| **SEC-20** | **KDS RPC Anonymous Role Fallback & Escalation** | **CRITICAL** | `transition_order_status` defaulted to `v_caller_role := 'staff'` if `auth.uid() IS NULL`, allowing unauthenticated clients with anon keys to perform staff operations. | **RESOLVED (Phase 4.1.1):** Revoked `EXECUTE` on `transition_order_status` and `get_kds_orders` from `PUBLIC, anon`. Enforced strict JWT claim check; raises `UNAUTHENTICATED` if caller identity is absent without `service_role`. |
| **SEC-21** | **Customer and Rider Operational RPC Invocations** | **HIGH** | Callers authenticated as `customer` or `rider` could invoke staff RPCs directly if knowledge of RPC parameters was acquired. | **RESOLVED (Phase 4.1.1):** Added server-side validation rejecting callers whose profile role is `customer` or `rider` with exception `FORBIDDEN`. |
| **SEC-22** | **Delivery / Pickup Workflow State Machine Bypass** | **MEDIUM** | Pickup orders could transition to `IN_TRANSIT`, and delivery orders could skip `IN_TRANSIT` to directly reach `DELIVERED`. | **RESOLVED (Phase 4.1.1):** Enforced fulfillment-type divergence in PostgreSQL: pickup orders cannot enter `IN_TRANSIT`, and delivery orders cannot bypass `IN_TRANSIT`. |
| **SEC-23** | **Unrecorded Refund Liability on Paid Order Rejection** | **HIGH** | Rejecting or cancelling a paid order changed status without flagging required refund processing or isolating financial records. | **RESOLVED (Phase 4.1.1):** Added `refund_status` column (`REFUND_REQUIRED` automatically assigned on paid cancellation). Preserved original payment records and logged `KDS_ORDER_CANCELLED_REFUND_REQUIRED` for manager review. |

---

## 2. Server-Authoritative Pricing Architecture

### 2.1 Client UX Estimator vs. Server Authority
- **Client Role (`src/domains/order/order-calculator.ts`):** Acts strictly as a **Client UX Estimator**. It renders instant subtotal, delivery fee, and grand total previews in the user interface to ensure a fast, responsive user experience.
- **Server Role (`public.create_order_authoritative()`):** The client *never* dictates final line item prices or order totals to the database. The client submits only `product_id`, `size_id`, `customization_options`, `fulfillment_type`, and `landmark_id`. The server queries active database prices, applies dynamic Half & Half surcharge rules (+₦1,000 for Regular/Standard; +₦1,500 for Large/Queen/King), adds the landmark delivery fee, and computes the authoritative total.
- **Estimate Reconciliation (`reconcileClientEstimateWithServer`):** Before payment initialization, the client estimate is verified against the server total. If a discrepancy exists (e.g. price changed during order flow), the user is prompted to review the updated total before payment.

---

## 3. Row-Level Security (RLS) Policy Matrix (Hardened)

All 15 tables enforce PostgreSQL Row-Level Security:

| Table | `SELECT` | `INSERT` | `UPDATE` | `DELETE` |
| :--- | :--- | :--- | :--- | :--- |
| **`profiles`** | `auth.uid() = id` OR `is_staff_or_admin()` | Internal signup trigger | `auth.uid() = id` (Protected against role alteration) | Disabled |
| **`categories`** | Public (`is_active = TRUE`) | `is_staff_or_admin()` | `is_staff_or_admin()` | `is_admin()` |
| **`products`** | Public | `is_staff_or_admin()` | `is_staff_or_admin()` | `is_admin()` |
| **`delivery_landmarks`** | Public (`is_active = TRUE`) | `is_admin()` | `is_admin()` | `is_admin()` |
| **`customer_addresses`**| `auth.uid() = customer_id` | `auth.uid() = customer_id` | `auth.uid() = customer_id` | `auth.uid() = customer_id` |
| **`orders`** | `auth.uid() = customer_id` OR `is_staff_or_admin()` (or via `get_order_by_receipt` with token) | **Zero-Direct-Client-Insert:** Prohibited for clients (`is_staff_or_admin()` only; normal orders created via `create_order_authoritative()`) | `is_staff_or_admin()` (Customers cannot alter status) | Disabled |
| **`order_items`** | Parent order owner OR `is_staff_or_admin()` | **Prohibited for clients:** Inserted exclusively by `create_order_authoritative()` | Disabled | Disabled |
| **`order_item_customizations`** | Parent order owner OR `is_staff_or_admin()` | **Prohibited for clients:** Inserted exclusively by `create_order_authoritative()` | Disabled | Disabled |
| **`payment_transactions`** | `is_staff_or_admin()` | Service Role / Settlement function only | Service Role / Settlement function only | Disabled |
| **`audit_logs`** | `is_admin()` | Trusted functions / staff | **Disabled (Trigger Denies)** | **Disabled (Trigger Denies)** |

---

## 4. Audit Log Immutability & Operational Limits

1. **Database-Level Controls:**
   - The PostgreSQL trigger `prevent_audit_log_modification` intercepts any `UPDATE` or `DELETE` statement targeting `public.audit_logs` and raises an exception:
     ```sql
     CREATE TRIGGER prevent_audit_log_modification
         BEFORE UPDATE OR DELETE ON public.audit_logs
         FOR EACH ROW EXECUTE FUNCTION public.reject_audit_tampering();
     ```
2. **Context Captured:** Every audit entry records `action`, `performed_by` (actor UUID or system component), `target_type`, `target_id`, `details` JSONB snapshot, `ip_address`, and UTC `created_at`.
3. **Immutability Limits Against Database Superusers:**
   - Triggers and RLS enforce immutability against application users, service accounts, and API callers.
   - However, a privileged database administrator with direct superuser (`postgres` role) access can disable triggers or truncate tables directly. For enterprise non-repudiation, logs should be mirrored to an external write-once-read-many (WORM) storage bucket or centralized SIEM (e.g., Datadog, AWS CloudWatch) in production.

---

## 5. Idempotency & Payment Readiness

1. **Idempotency Scoping & Retry Safety:**
   - Every order submission requires a client-generated UUID `idempotency_key`.
   - The database enforces a `UNIQUE` constraint on `idempotency_key`.
   - If a network failure occurs and the client retries, `create_order_authoritative()` checks if an order with that key already exists:
     - If found in `PENDING_PAYMENT`, it returns the existing order record without creating duplicates or multiple payment attempts.
2. **Server-Side Paystack Reconciliation:**
   - When integrating Paystack in Phase 3, payment verification will execute strictly server-side:
     - Webhook listener verifies HMAC-SHA512 signature using `PAYSTACK_SECRET_KEY`.
     - Transaction amount is verified against `orders.total * 100` (Kobo match).
     - Currency is verified as `NGN`.
     - Reference is verified to match the assigned transaction reference.
   - **Zero Secret Exposure:** All Paystack secret keys remain strictly server-side; the mobile app only holds the public key (`EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY`).

---

## 6. Phase 4.1 & 4.1.1 KDS & Staff Operations Security

1. **Staff Role Isolation (Least Privilege):**
   - Granular RBAC distinguishes `kitchen`, `counter`, `manager`, and `admin`.
   - Kitchen staff cannot cancel orders, issue refunds, alter item prices, mark orders in transit, or access audit logs.
   - Counter staff cannot initiate baking or kitchen preparation.
   - Neither `customer` nor `rider` accounts can execute operational transitions.
   - RPC execution permissions revoked from `PUBLIC` and `anon`.
2. **Build-Isolated Role Simulation:**
   - Role simulation switcher is excluded from production builds via `__DEV__`. In production, a static read-only badge is rendered.
   - PostgreSQL RPCs authenticate against server-side session identity, preventing client privilege spoofing.
3. **Payment vs. Fulfillment Decoupling & Refund Integrity:**
   - Staff are technically blocked from altering `subtotal`, `delivery_fee`, `total`, or `payment_reference`.
   - The RPC `transition_order_status` accepts only operational parameters (`target_status`, `reason`, `notes`).
   - Unpaid orders (`DRAFT`, `PENDING_PAYMENT`) cannot be accepted or advanced by staff.
   - Paid order cancellation records `refund_status = 'REFUND_REQUIRED'` and logs audit action `KDS_ORDER_CANCELLED_REFUND_REQUIRED` without modifying payment ledger or balance.
4. **Fulfillment Workflow Divergence:**
   - Pickup orders cannot enter `IN_TRANSIT`.
   - Delivery orders cannot jump from `READY_FOR_PICKUP` to `DELIVERED` without passing through `IN_TRANSIT`.
5. **Atomic Concurrency Protection & Versioning:**
   - All state transitions lock the order row with `FOR UPDATE`.
   - Database-backed `orders.version` increments on every update, allowing Realtime subscribers to discard stale out-of-order events (`newRecord.version <= existing.version`).
   - If two staff members attempt conflicting actions, serialized execution validates `expected_current_status` and rejects the second caller with `CONCURRENT_MODIFICATION`.
6. **Auditability:**
   - Every status transition is logged to `public.audit_logs` with staff UUID, role, previous state, new state, and timestamps.
   - The tamper-evident trigger `reject_audit_tampering()` prevents modification or deletion of staff audit records.
