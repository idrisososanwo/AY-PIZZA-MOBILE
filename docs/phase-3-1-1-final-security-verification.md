# AY Pizza — Phase 3.1.1 Final Payment Security Verification Report

**Date:** October 22, 2026  
**Status:** Verification & Hardening Complete — Ready for Phase 4 Authorization  
**Branch:** Working Branch  
**Target Architecture:** Expo / React Native, Supabase, PostgreSQL, Paystack Edge Functions  

---

## 1. Receipt-Token Cryptographic Analysis

### Background & Inspection
In Phase 3.1 (`20261021000006_phase3_1_security_verification.sql`), the implementation attempted to address receipt token management using a Key Derivation Function (KDF):
```sql
c_receipt_kdf_salt CONSTANT TEXT := 'ay_pizza_receipt_kdf_v1_secret_salt_2026';
v_receipt_token := encode(hmac(TRIM(p_idempotency_key), c_receipt_kdf_salt, 'sha256'), 'hex');
v_receipt_token_hash := encode(digest(v_receipt_token, 'sha256'), 'hex');
```

### Adversarial Security Assessment & Answers
1. **Is the HMAC secret cryptographically random?**
   **NO.** It was a static, hardcoded string constant (`'ay_pizza_receipt_kdf_v1_secret_salt_2026'`) committed to source control and migrations.
2. **Is it inaccessible to anon/authenticated clients?**
   **NO.** Any developer, auditor, or attacker with repository access or access to database procedural definitions (`pg_proc`) could view the function source code and recover the salt.
3. **Can a customer derive their receipt token from their client-generated idempotency key?**
   **YES.** Because the client generates the idempotency key and the salt is static, a customer could compute the token client-side without relying on server authorization.
4. **Can another customer derive another customer's token?**
   **YES.** If idempotency keys follow predictable patterns (e.g. UUIDv1, timestamp-based, or sequential sequences), an attacker could predict or enumerate another user's receipt token.
5. **Can a database reader derive usable receipt tokens?**
   **YES.** This was the most critical finding: `orders.idempotency_key` is stored in plaintext on the `orders` table. Any read-only database reader could execute `hmac(orders.idempotency_key, salt, 'sha256')` and derive valid plaintext receipt tokens for every order in the system, nullifying the security benefit of storing `receipt_token_hash`.
6. **Is the receipt token actually 256-bit unpredictable?**
   **NO.** Its entropy was bounded strictly by the entropy of the client's idempotency key and public salt.

### Cryptographic Hardening Implemented
In migration `20261022000001_phase3_1_1_security_hardening.sql`, the KDF and hardcoded salt have been completely removed. Order creation now generates a cryptographically secure, unguessable token server-side:
```sql
v_receipt_token := encode(gen_random_bytes(32), 'hex');
v_receipt_token_hash := encode(digest(v_receipt_token, 'sha256'), 'hex');
```
- **Entropy:** Exactly 256 bits of CSPRNG entropy from PostgreSQL's `gen_random_bytes(32)`.
- **Database Storage:** Only `SHA-256(receipt_token)` is persisted at rest in `orders.receipt_token_hash`.
- **Plaintext Token Delivery:** Returned once to the legitimate caller over TLS on initial creation.
- **Idempotent Retries:** Return `receipt_token: NULL` on retry because the one-way hash cannot be inverted, ensuring plaintext tokens are never reconstructible from database state.

---

## 2. Product-Size Authorization Analysis

### Data Model & Category-Level Sharing Inspection
We inspected the database schema and query:
```sql
ps.product_id = v_prod.id OR (ps.category_slug IS NOT NULL AND ps.category_slug = v_prod.category_slug)
```
- **Architectural Intention:** Category-level size sharing is an intentional, foundational design decision in the AY Pizza data model (originating in `20261021000001_initial_schema.sql` and `20261021000002_seed_ay_pizza.sql`). 
- All 13 AY Pizza varieties share 5 universal pizza sizes: `Regular` (₦0), `Standard` (+₦1,500), `Large` (+₦3,000), `Queen` (+₦5,000), and `King` (+₦7,000) defined with `category_slug = 'pizza'` and `product_id = NULL`.
- In contrast, beverage and dessert items have product-specific sizes defined with `product_id = '<uuid>'` and `category_slug = NULL` (e.g. `Small Shake`, `Big Shake`, `Small Cup`, `Medium Cup`, `Big Cup`).

### Defect Identified & Remediated
`product_sizes` previously lacked an `is_available` column. If a particular size was out of stock (e.g., King pizza boxes unavailable), there was no mechanism to disable the size without deleting database records.
- **Fix:** Migration `20261022000001_phase3_1_1_security_hardening.sql` added `is_available BOOLEAN NOT NULL DEFAULT TRUE` to `public.product_sizes`.
- **Validation:** `create_order_authoritative()` now enforces `AND ps.is_available = TRUE`.

### Adversarial Test Matrix Results
| Scenario | Expected Outcome | Actual Result | Status |
|---|---|---|---|
| 1. Pizza A + Pizza A valid universal size | Succeeds | Resolves size, applies correct price | ✅ PASS |
| 2. Pizza A + Pizza B-only exclusive size | Fails | Rejects with invalid size error | ✅ PASS |
| 3. Pizza + milkshake size | Fails | Rejects with invalid size error | ✅ PASS |
| 4. Pizza + unrelated category size | Fails | Rejects with invalid size error | ✅ PASS |
| 5. Category-wide shared pizza size | Succeeds | Resolves across all pizza varieties | ✅ PASS |
| 6. Inactive/unavailable size | Fails | Rejects with invalid/unavailable size error | ✅ PASS |

---

## 3. Customization Authorization Results

### Relational Chain Verification
The authorization chain:
$$\text{Product} \longrightarrow \text{Customization Group} \longrightarrow \text{Customization Option}$$
was verified end-to-end:
1. `co.group_id = cg.id`: Option belongs to a valid customization group.
2. Group link: Group is assigned either to the specific product (`product_customization_groups.product_id = v_prod.id`) OR category-wide (`cg.category_slug = v_prod.category_slug`).
3. `co.is_available = TRUE`: Inactive or out-of-stock options are rejected.
4. **Half & Half Validation:**
   - Only permitted for category `pizza` (`IF v_prod.category_slug != 'pizza' THEN RAISE EXCEPTION ...`).
   - Secondary pizza must exist, belong to category `pizza`, and have `is_available = TRUE`.
   - Surcharges dynamically calculated by size: ₦1,000 for Regular/Standard; ₦1,500 for Large/Queen/King.

### Test Results
- Valid pizza + valid pizza topping → **Succeeds** (Cheese, Beef, Chicken, Pepperoni).
- Valid pizza + milkshake topping → **Fails** (Option not linked to pizza product or pizza category).
- Valid pizza + dessert option → **Fails** (Dessert options restricted to icecream category).
- Valid pizza + option from another product's exclusive group → **Fails**.
- Inactive option (`is_available = false`) → **Fails**.
- Unavailable option → **Fails**.
- Half & Half with non-pizza product (Milkshake) → **Fails** (`Half & Half flavor is only permitted for pizza items`).
- Half & Half with unavailable secondary pizza → **Fails** (`Secondary pizza is currently out of stock`).

---

## 4. Device Storage Assessment

### Storage Audit Findings
1. **Plaintext Receipt Token Location:**
   - In the mobile application (`App.tsx`), `receiptToken` returned from `orderService.createAuthoritativeOrder` is held solely in ephemeral React state (`paystackParams` and `receiptData`).
   - When the user completes payment and views the receipt modal, the token is passed to `OrderReceiptModal`.
   - Upon closing the receipt (`handleReceiptDone`), `setReceiptData(null)` clears the state from memory.
2. **Persistent Storage:**
   - `AsyncStorage` is used **exclusively** for the local cart cache (`@ay_pizza_local_cart_v1`) and Supabase auth session tokens.
   - **No receipt tokens or order security credentials are written to AsyncStorage.**
3. **SecureStore Assessment:**
   - Holding guest receipt tokens in ephemeral component memory provides zero disk exposure at rest without requiring native Keychain/Keystore dependencies for guest checkout.
   - If guest order history is made persistent across app launches in a future phase, it **must** be stored in Expo SecureStore (`expo-secure-store`), never unencrypted AsyncStorage.
4. **Leakage Audit:**
   - Confirmed zero exposure through console logs (`console.log`), analytics, crash reporting, or URL query parameters.

---

## 5. Payment Attempt Idempotency Assessment

### Invariants Verified
1. **Unique Paystack References:**
   - Enforced by `reference TEXT NOT NULL UNIQUE` on `public.payment_transactions`.
2. **15-Minute Session Reuse:**
   - `paystack-init` checks for an existing `initialized` transaction within 15 minutes (`created_at >= 15 min ago`).
   - If found, reuses `access_code`, `authorization_url`, and `reference` with `isReused: true`.
3. **Confirmed / Non-Pending Orders:**
   - `paystack-init` rejects initialization if `order.status !== 'PENDING_PAYMENT'`.
4. **Expired Attempts:**
   - If previous attempt is older than 15 minutes, a new unique reference is generated and registered.
5. **Duplicate Payment Handling:**
   - If a second successful charge arrives for an already confirmed order (`status IN ('CONFIRMED', 'PAID', ...)`):
     - If same reference: treated as an idempotent webhook replay (`already_settled: true`).
     - If different reference: recorded with `status = 'duplicate_success_needs_refund'`, creates an immutable audit log event `DUPLICATE_PAYMENT_DETECTED`, flags for manual staff refund, and **does not alter the order amount or status**.

---

## 6. Webhook and Settlement Security Assessment

### Full Verification Chain
$$\text{Raw Body} \xrightarrow{\text{HMAC-SHA512}} \text{Timing-Safe Check} \xrightarrow{\text{Dual REST API Verify}} \text{Amount/Currency Match} \xrightarrow{\text{Replay Check}} \text{Privileged Settlement}$$

1. **HMAC Signature Validation:**
   - Computed over raw request body using `paystackSecretKey` with HMAC-SHA512.
   - Compared using `timingSafeEqual()` to mitigate timing side-channel attacks.
2. **Dual-Verification with Paystack REST API:**
   - Even with a valid signature, the webhook handler queries `https://api.paystack.co/transaction/verify/:reference` before touching database state.
   - Validates that `status === 'success'`, `currency === 'NGN'`, and `amount === amountInKobo`.
3. **Privileged Database Settlement:**
   - `settle_order_payment()` has had `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated`.
   - Granted exclusively to `service_role`.
   - No customer or anonymous client can directly execute settlement or mark an order as paid.

---

## 7. Vulnerabilities Discovered and Remediated

| Vulnerability | Severity | Root Cause | Remediation Applied |
|---|---|---|---|
| **Deterministic KDF Receipt Token** | **HIGH** | Static salt combined with plaintext `idempotency_key` stored in DB allowed anyone with DB read access to compute valid receipt tokens. | Replaced with server-side CSPRNG `gen_random_bytes(32)`. Stored only SHA-256 hash at rest. |
| **Missing Product Size Availability** | **MEDIUM** | `product_sizes` had no `is_available` column, preventing deactivation of sizes. | Added `is_available BOOLEAN DEFAULT TRUE` and enforced `ps.is_available = TRUE` in `create_order_authoritative()`. |
| **Idempotent Retry Token Exposure** | **LOW** | Initial retry logic attempted to return KDF-derived token on order creation retries. | Changed to return `receipt_token: NULL` on retry since hash cannot be inverted. |

---

## 8. Exact Migrations Changed & Added

1. **New Migration:**
   - [supabase/migrations/20261022000001_phase3_1_1_security_hardening.sql](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261022000001_phase3_1_1_security_hardening.sql)
     - Added `is_available` column to `product_sizes`.
     - Replaced KDF with `encode(gen_random_bytes(32), 'hex')`.
     - Stored only `SHA-256(receipt_token)` in `orders.receipt_token_hash`.
     - Enforced `ps.is_available = TRUE` in size resolution.
2. **TypeScript Database Definitions:**
   - [src/types/database.ts](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/types/database.ts): Updated `product_sizes` schema definition with `is_available`.
   - [src/types/catalog.ts](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/types/catalog.ts): Added optional `isAvailable?: boolean` to `ProductSize`.

---

## 9. Automated Test Results

### 1. Jest Test Suite (`npm test`)
```text
Test Suites: 11 passed, 11 total
Tests:       149 passed, 149 total
Snapshots:   0 total
Time:        16.565 s
Ran all test suites.
```
- **New Test File:** [src/\_\_tests\_\_/phase3-1-1-final-security-verification.test.ts](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/__tests__/phase3-1-1-final-security-verification.test.ts) (28 new adversarial tests covering all 6 focus areas).

### 2. TypeScript Typecheck (`npx tsc --noEmit`)
```text
Exit code: 0 (No type errors)
```

### 3. Expo Doctor (`npx expo-doctor`)
```text
Running 20 checks on your project...
20/20 checks passed. No issues detected!
```

---

## 10. Remaining Limitations

1. **Merchant Test Credentials:**
   - Real Paystack sandbox end-to-end execution remains gated on the provision of valid test merchant keys and restaurant owner approval.
2. **Guest Order Recovery Without Token:**
   - If an unauthenticated guest customer loses their receipt token and closes the app, their order cannot be retrieved through the public API without staff intervention. This is intentional to prevent unauthorized receipt harvesting.

---

## 11. Final Certification

Phase 3.1.1 payment security, receipt cryptographic isolation, product-size relational authorization, customization validation, payment attempt idempotency, and settlement privilege boundaries are verified and hardened.

**Phase 3 is fully closed. Standing by for Phase 4 authorization.**
