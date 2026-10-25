# Technical Risks & Mitigation Matrix

**Project:** AY Pizza Mobile Application (iOS & Android)  
**Document:** Technical Risk Assessment (Phase 0 Discovery)  
**Date:** October 21, 2026  

---

## 1. Executive Summary

Developing a production-grade restaurant application for an active campus restaurant requires addressing unique technical and operational vulnerabilities. This matrix identifies specific failure modes across payment processing, network unpredictability, multi-channel inventory conflicts, customer security, and kitchen operations, pairing each with a battle-tested engineering mitigation strategy.

---

## 2. Risk Assessment & Mitigation Matrix

| Risk ID | Risk Category | Severity | Likelihood | Technical Description & Root Cause | Engineering Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TR-01** | **Duplicate Orders & Double Charges** | **CRITICAL** | **HIGH** | Unstable Nigerian mobile network connections lead to duplicate HTTP POST submissions when a student taps "Place Order" multiple times, or Paystack fires duplicate webhook events for a single transaction. | 1. Implement client-side submission disabling with UI debouncing.<br>2. Generate a client-side UUID **Idempotency Key** attached to each checkout request.<br>3. Enforce database-level unique constraints on `payment_reference` and `idempotency_key`.<br>4. Wrap order creation inside strict ACID database transactions with row-level locks. |
| **TR-02** | **Payment Verification Failures & Phantom Orders** | **CRITICAL** | **MEDIUM** | Students complete bank transfer or USSD payment inside the Paystack modal, but switch apps or lose connection before the mobile client receives the callback, causing orders to remain trapped in "pending". | 1. Never rely on client-side redirect callbacks for fulfillment.<br>2. Server-side Paystack Webhook listener validates HMAC-SHA512 signature and executes idempotent fulfillment.<br>3. Background reconciliation worker queries `https://api.paystack.co/transaction/verify/{reference}` every 2 minutes for any order stranded in `pending_payment` beyond 5 minutes.<br>4. Automatic timeout and refund trigger if unverified after 20 minutes. |
| **TR-03** | **Inventory Inconsistencies & Over-selling** | **HIGH** | **HIGH** | Walk-in counter customers, phone orders, or Chowdeck orders exhaust physical ingredients (e.g., pizza dough or specific toppings like Steak or Bailey flavor), while mobile app users continue ordering out-of-stock items. | 1. Implement an instant **"1-Tap Kill Switch"** on the kitchen tablet interface to mark any item, flavor, or topping out-of-stock.<br>2. Subscribe customer mobile apps to real-time inventory updates (via WebSocket / Supabase Realtime).<br>3. Kitchen "Order Acceptance Window" (staff has 3 minutes to confirm order before baking; if an ingredient is missing, kitchen can reject with an instant automated wallet/Paystack refund). |
| **TR-04** | **Unverified Chowdeck API & Integration Lock-out** | **HIGH** | **MEDIUM** | Assuming Chowdeck will grant immediate, unrestricted API access without confirming the restaurant's merchant agreement tier, risking project stall. | 1. **Zero-Dependency Architectural Decoupling:** Treat the mobile app as an autonomous, high-margin Direct-to-Consumer (D2C) channel.<br>2. Do not block mobile app launch on Chowdeck API approvals.<br>3. If Chowdeck merchant credentials are provided, integrate incrementally (e.g., for off-campus Relay dispatch) in Phase 2. |
| **TR-05** | **Customer Data Exposure & NDPR Non-Compliance** | **HIGH** | **LOW** | Storage of customer phone numbers, campus delivery locations, or order histories on insecure shared hosting or unauthenticated endpoints. | 1. Fully isolated cloud database (PostgreSQL with Row Level Security).<br>2. Stateless JWT authentication with Argon2id password hashing.<br>3. Strict zero-PAN storage policy: no card details or CVVs ever touch our server; all tokens are held by Paystack.<br>4. Explicit opt-in and consent protocols complying with the Nigeria Data Protection Regulation (NDPR). |
| **TR-06** | **Kitchen Operational Fatigue & Missed Orders** | **HIGH** | **HIGH** | During peak lunch/dinner rush opposite King Jaja, loud kitchen environment causes staff to miss silent app notifications, resulting in cold pizzas and angry students. | 1. High-decibel looping audio alarm on the kitchen device that only silences when staff taps "Acknowledge Order".<br>2. Full-screen blinking visual alert (Red/Yellow/Green KDS color coding).<br>3. Automated escalation SMS/WhatsApp notification to store manager's personal phone (`0813 073 1895`) if an order remains unacknowledged for > 5 minutes.<br>4. Optional ESC/POS thermal receipt printer output for physical order slips at the oven station. |
| **TR-07** | **Campus Geo-location & Delivery Address Confusion** | **MEDIUM** | **HIGH** | UNILAG campus addresses do not follow standard street numbering; students enter ambiguous descriptions like "room 12, new hall, block c" which confusingly routes riders. | 1. Structured, campus-specific address selection UI (Hostel Picker ➔ Block Picker ➔ Room Number ➔ Landmark Porter Gate).<br>2. In-app direct calling/messaging between student and dispatch rider with pre-filled UNILAG landmark hints.<br>3. Clear separation of UNILAG on-campus deliveries (₦500 flat fee) from mainland neighborhood deliveries. |
| **TR-08** | **App Store Review Delays & Guideline Scrutiny** | **MEDIUM** | **MEDIUM** | Apple App Store review delays regarding food ordering, physical goods payment compliance (Apple Pay vs Paystack IAP guidelines), or location permissions. | 1. Physical goods food delivery is exempt from Apple 30% IAP commission (App Store Review Guideline 3.1.5).<br>2. Implement standard Apple Pay alongside Paystack cards for seamless iOS approval.<br>3. Build using Expo Application Services (EAS) with automated OTA (Over-The-Air) update capabilities for instant bug fixes without resubmission delays. |

---

## 3. High-Priority Architectural Safeguards

1. **Strict Idempotency:** Every financial mutation must accept an `X-Idempotency-Key` header and enforce deduplication.
2. **State Machine Integrity:** Orders must follow a non-reversible state machine:
   ```
   DRAFT ➔ PENDING_PAYMENT ➔ PAID ➔ CONFIRMED_BY_KITCHEN ➔ PREPARING ➔ READY_FOR_PICKUP / IN_TRANSIT ➔ DELIVERED ➔ ARCHIVED
   (Failure branches: CANCELLED, REFUNDED, REJECTED)
   ```
3. **Graceful Offline Handling:** When student internet cuts out in concrete hostel blocks, the app preserves cart state locally, displays offline warning banners, and auto-resumes once connectivity is restored.
