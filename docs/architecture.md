# System Architecture: AY Pizza Mobile Platform

**Project:** AY Pizza Production-Ready Mobile Ordering System  
**Phase:** Phase 2: Product Catalog Browsing, Customizer Engine & Local Cart  
**Date:** October 2026  
**Status:** Hardened, Tested & Verified (71/71 Tests Passing)  

---

## 1. Architectural Vision

The AY Pizza platform is engineered as a resilient, real-time, multi-client system designed to modernize restaurant operations opposite King Jaja Hall, University of Lagos (UNILAG). The platform supports three primary interfaces sharing a single PostgreSQL source of truth:
1. **Customer Mobile Application (iOS & Android):** Built with React Native & Expo for browsing, customizing, placing orders, and tracking status.
2. **Kitchen Display System (KDS):** Responsive, real-time tablet interface for kitchen staff behind the counter with audio chimes and status progression.
3. **Store Management Dashboard:** Administrative portal for menu inventory kill-switches, pricing updates, and sales analytics.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AY PIZZA MOBILE CLIENT                          │
│               React Native + Expo SDK 58 + TypeScript                  │
│                                                                        │
│   ┌─────────────────────┐  ┌────────────────────┐  ┌────────────────┐ │
│   │   Auth & Profile    │  │  Catalog & Custom  │  │ Cart & Orders  │ │
│   │ (Client UX Estimate)│  │ (Provisional Menu) │  │  (Idempotent)  │ │
│   └──────────┬──────────┘  └─────────┬──────────┘  └────────┬───────┘ │
│              │                       │                      │         │
│              │         ┌─────────────┴────────────┐         │         │
│              │         │ Customizer Engine        │         │         │
│              │         │ • 5 Pizza Sizes (Regular)│         │         │
│              │         │ • Half & Half Builder    │         │         │
│              │         │ • Flavor Bounds (Max 2)  │         │         │
│              │         │ • Deterministic Hashing  │         │         │
│              │         └─────────────┬────────────┘         │         │
│              │                       │                      │         │
│              │         ┌─────────────▼────────────┐         │         │
│              │         │ Persistent Local Cart    │         │         │
│              │         │ • AsyncStorage           │         │         │
│              │         │ • In-Place Item Editing  │         │         │
│              │         │ • 19 Delivery Landmarks  │         │         │
│              │         │ • Catalog Reconciliation │         │         │
│              │         └─────────────┬────────────┘         │         │
└──────────────┼───────────────────────┼──────────────────────┼──────────┘
               │                       │                      │
               │ REST / WebSocket      │ Supabase Client      │ Authoritative
               │                       │                      │ RPC / Edge Call
┌──────────────▼───────────────────────▼──────────────────────▼──────────┐
│                           SUPABASE ENGINE                              │
│                                                                        │
│  ┌──────────────────────┐  ┌───────────────────┐  ┌────────────────┐   │
│  │    Supabase Auth     │  │ Supabase Realtime │  │ Edge Functions │   │
│  │ (Phone OTP + Social) │  │  (KDS WebSocket)  │  │  (Webhooks)    │   │
│  └──────────┬───────────┘  └─────────┬─────────┘  └────────┬───────┘   │
└─────────────┼────────────────────────┼─────────────────────┼───────────┘
              │                        │                     │
┌─────────────▼────────────────────────▼─────────────────────▼───────────┐
│                     POSTGRESQL RELATIONAL DATABASE                     │
│                                                                        │
│   • create_order_authoritative(): Re-verifies all prices from database│
│   • Row-Level Security (RLS) Enforced on ALL 15 Tables                 │
│   • Anti-Escalation & Audit-Immutability PostgreSQL Triggers           │
│   • Dynamic Provisional Landmark Rates & Configurable Dietary Rules    │
└──────────────────────────────────────▲─────────────────────────────────┘
                                       │
                      PAYSTACK SECURE PAYMENT GATEWAY
                    (Cards, USSD, Bank Transfer, Apple Pay)
```

---

## 2. Server-Authoritative Pricing & Data Integrity Boundary

To eliminate the risk of client price poisoning while preserving a responsive user experience:

1. **Client UX Estimator (`order-calculator.ts` & `customizer-engine.ts`):** Computes instant subtotal, delivery fee, and grand total previews in the mobile cart, providing responsive visual feedback as users add toppings or change pizza sizes. All figures in the UI are explicitly flagged with `(est.)` and disclaimers.
2. **Authoritative Order Creation (`create_order_authoritative`):**
   - The client never dictates prices or discounts to the database.
   - When the user places an order, the payload transmits only item IDs, size IDs, customization option IDs, fulfillment type, and landmark ID.
   - The PostgreSQL stored procedure queries `public.products`, `public.product_sizes`, `public.customization_options`, and `public.delivery_landmarks` to compute line totals, delivery charges, and final sums on the database server.
   - Direct table INSERT on `orders` is restricted by RLS to `status = 'PENDING_PAYMENT'`.

---

## 3. Product Catalog Browsing Architecture

Catalog data is managed via `CatalogRepository` (`src/domains/catalog/catalog-repository.ts`):
- **Database-Driven Querying:** Queries `public.categories`, `public.products`, `public.product_sizes`, `public.customization_groups`, and `public.customization_options`.
- **Offline / Test Cache Layer:** When Supabase connection is offline or running with placeholder credentials, the repository seamlessly provides the fully seeded catalog matching migrations `20261021000002` and `20261021000004`.
- **Provisional Data Flagging:** Reverse-engineered prices and delivery fees carry `isProvisional = true` until approved by the restaurant owner.
- **Filtering & Search:** Real-time filtering by category slug (`pizza`, `icecream`, `fastfood`, `drinks`) and case-insensitive keyword search across product names and descriptions.

---

## 4. Customizer Engine Architecture

The customization engine (`src/domains/customizer/customizer-engine.ts`) is a modular, data-driven domain service:
- **Required & Optional Selections:** Validates group `minSelections` and `maxSelections` constraints.
- **Universal Pizza Sizes:** Five sizes (Regular +₦0, Standard +₦1,500, Large +₦3,000, Queen +₦5,000, King +₦7,000).
- **Half & Half Pizza Builder:**
  - Configurable toggle allowing customers to select a secondary pizza flavor from available pizza products.
  - Dynamically calculates size-dependent surcharges: Regular/Standard = +₦1,000; Large/Queen/King = +₦1,500.
  - Validates that the secondary flavor is in stock and differs from the primary flavor.
- **Dessert Flavor Constraints:** Supports milkshakes and soft-serve ice cream cups with a strict limit of max 2 flavors and up to 8 dessert toppings (+₦1,000 each).
- **Deterministic Item Hashing:**
  `generateCustomizerItemHash()` generates a unique hash based on `productId`, `sizeId`, sorted `optionIds`, `halfSecondaryFlavor`, and `specialInstructions`. Identical configurations merge into single line items with increased quantities; different configurations remain distinct.

---

## 5. Local Cart Store Architecture

The local cart (`src/domains/cart/cart-store.ts`) handles customer shopping sessions:
- **AsyncStorage Persistence:** Serializes cart state using versioned envelope `{ schemaVersion: 2, state }` with backward compatibility for v1. Catches disk quota/write errors into `storageError` state, and gracefully resets corrupted JSON to empty state without throwing.
- **In-Place Item Editing:** Tapping "Edit" on a cart item re-opens `CustomizerModal` prefilled with its exact options. When saved, the item updates in place without duplicating line items.
- **Quantity Management:** Increment and decrement steppers clamp quantity between 1 and 99; reducing below 1 removes the item.
- **Fulfillment Management:** Seamless toggle between Campus Delivery (19 UNILAG landmarks with fees ₦500 to ₦4,000) and Pickup at King Jaja Hall (fee ₦0). Switching to pickup deactivates delivery landmark and sets fee strictly to ₦0.
- **Catalog Reconciliation:** `reconcileWithCatalog(freshProducts)` verifies live stock status, validates selected sizes, options, and Half & Half secondary flavors.
- **Price Change Acceptance Protocol:** If live prices change during reconciliation, updates are tracked in `priceChangeNotice`. Checkout is blocked (`isReadyForCheckout: false`) until the customer explicitly accepts the updated total via `acceptPriceAdjustment()`.

---

## 5.1 Phase 2.1 Verification & Data Integrity Hardening

During Phase 2.1 adversarial verification, the following critical integrity protections were established:
1. **Production Fallback Elimination:** In `src/domains/catalog/catalog-repository.ts`, if `Config.isProduction === true`, fallback to static seed data is strictly disabled. Unconfigured Supabase credentials or database network failures throw fatal configuration/network errors rather than silently serving mock data to paying customers.
2. **Resilient Cart Storage (Envelope Schema v2):** Cart persistence isolates corrupt storage inputs, sanitizes item bounds (1-99 quantity clamp, negative price prevention, missing ID discard), and reports storage write failures to the UI via `state.storageError`.
3. **Deep Customization Reconciliation:** The reconciliation engine checks not only top-level product availability, but also validates that selected size IDs exist, selected topping option IDs are active with updated pricing, and Half & Half secondary pizza flavors remain in stock.
4. **Deterministic Hash Normalization:** `generateCustomizerItemHash()` normalizes whitespace, lowercases special instructions, sorts option IDs, and prefixes Half & Half identifiers, preventing split line items for identical configurations.
5. **Strict Fulfillment Readiness:** Checkout readiness (`isReadyForCheckout`) is computed deterministically in `recomputeTotals()`. Unaccepted price changes, unavailable items, invalid options, missing delivery landmarks, or empty delivery addresses are added to `checkoutBlockers` and disable checkout.

---

## 6. Phase 3 Checkout & Paystack Payment Architecture

Phase 3 delivers the complete, server-authoritative customer checkout and payment processing pipeline:
1. **Zero-Direct-Client-Insert Enforcement:** In migration `20261021000005_phase3_checkout_and_paystack.sql`, PostgreSQL Row-Level Security (RLS) policies prohibit direct client `INSERT` into `orders`, `order_items`, and `order_item_customizations`. All orders MUST be created via `create_order_authoritative()`.
2. **Authoritative Server Pricing:** `create_order_authoritative()` re-queries product base prices, size surcharges, customization options, and landmark delivery fees directly from PostgreSQL. Integer kobo conversions (`Math.round(total * 100)`) prevent floating-point financial bugs.
3. **Cryptographic Receipt Tokens & Hashing at Rest:** In Phase 3.1, `orders.receipt_token_hash` stores a SHA-256 hash at rest, eliminating plaintext bearer credentials from database tables. The secure RPC `get_order_by_receipt(order_id, receipt_token)` hashes the caller-provided token to authenticate receipt access without reflecting tokens or hashes in the response.
4. **Relational Customization & Size Authorization:** `create_order_authoritative()` validates that selected size IDs belong to the product or its category, and selected customization option IDs belong to customization groups linked to that product via `product_customization_groups`.
5. **Paystack Provider Abstraction & Dual-Verification:** `PaymentProvider` interface decouples the application from gateway specifics. In Phase 3.1, Paystack webhooks enforce timing-safe HMAC-SHA512 verification AND perform an independent dual-verification call to `GET https://api.paystack.co/transaction/verify/:reference` before calling `settle_order_payment()`.
6. **Privilege-Restricted Settlement:** `settle_order_payment()` has EXECUTE revoked from `anon` and `authenticated` and is granted strictly to `service_role`. Multi-charge events log `DUPLICATE_PAYMENT_DETECTED` and delayed payments on cancelled orders log `PAYMENT_RECEIVED_ON_CANCELLED_ORDER` without reviving cancelled orders.

---

## 6.1 Phase 3.1.4 External Ambiguous-Outcome Recovery & Concurrency Architecture

Phase 3.1.4 hardens the external payment initialization lifecycle against distributed failure modes:
1. **Ambiguous Provider State (`requires_reconciliation`):** When an HTTP timeout or network interruption occurs while contacting Paystack, the transaction transitions to `status = 'requires_reconciliation'`. The partial unique index covers `status IN ('initiating', 'requires_reconciliation', 'initialized')`, blocking the generation of competing or replacement references.
2. **Mandatory REST Reconciliation Before Replacement:** Stale reservations (>45s) and dropped responses undergo mandatory verification via Paystack's REST API (`GET /transaction/verify/:reference`). If the transaction exists at Paystack, it is recovered into `status = 'initialized'` (or settled if paid); if confirmed not found, it is marked `failed` to safely release the constraint.
3. **Hardware-Backed Guest Receipt Persistence:** `GuestReceiptStore` leverages Expo SecureStore (`expo-secure-store`) with an async mutex queue (`withIndexLock`) to prevent race conditions during rapid index updates.
4. **Retention Policy:** Delivered and `CANCELLED` orders are strictly retained in SecureStore so customers can review order history, cancellation notes, and refund reconciliation information. Pruning is restricted to explicit customer dismissal or FIFO max-20 bounds.
5. **Scenario A vs Scenario B Distinction:** Explicitly distinguishes locally recoverable tokens (Scenario A: app closed/restarted) from lost initial responses (Scenario B: network dropped before response reached client). For Scenario B, an honest customer notice is displayed and the phone OTP recovery protocol is specified.

---

---

## 6.2 Phase 4.1 & 4.1.1 Kitchen Display System (KDS) & Staff Order Operations

Phase 4.1 and Phase 4.1.1 implement and harden the authoritative kitchen display and staff workflow architecture:
1. **Realtime Order Pipeline:** Orders transitioned to `CONFIRMED` upon verified Paystack settlement automatically stream into the KDS via Supabase Realtime WebSocket subscription (`public.orders`).
2. **State Machine Serialization:** Staff actions run through the atomic `transition_order_status()` PostgreSQL RPC with `FOR UPDATE` row locking. Concurrency conflicts return `CONCURRENT_MODIFICATION` rather than corrupting state.
3. **Staff Roles (RBAC) & DB Authorization:** Dedicated roles for `kitchen`, `counter`, and `manager`. Kitchen staff are restricted to operational preparation actions (`ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`) without financial or cancellation privileges. RPC calls reject unauthenticated, customer, and rider callers.
4. **Fulfillment Workflow Divergence:** Database-enforced bifurcation: pickup orders cannot enter `IN_TRANSIT`, and delivery orders cannot bypass `IN_TRANSIT` to reach `DELIVERED`.
5. **Monotonic Version Event Ordering:** Database-backed `orders.version` column increments on each transition. Realtime subscriptions reject out-of-order or duplicate payloads (`newRecord.version <= existing.version`).
6. **Strict Financial Isolation & Refund Tracking:** KDS actions cannot modify order totals, fees, or payment references. Rejection of paid orders flags `refund_status = 'REFUND_REQUIRED'` for administrative review without mutating payment transactions.
7. **Cross-Platform Audio & Vibration:** HTML5 Web Audio API chime with graceful vibration fallback on native devices (`Vibration.vibrate`).
8. **Build-Isolated Role Simulation:** Role switching is gated behind `__DEV__`; production builds render an immutable authenticated server role badge.

---

## 7. Strict Phase Boundary

Phase 4.1 and Phase 4.1.1 are fully verified and hardened. The following features are strictly reserved for subsequent phases:
- **Phase 4.2:** Delivery dispatch workflow, external delivery fleet handover, and rider operational interface.
- **Phase 5:** Customer live tracking, rider GPS tracking, push notifications, and customer loyalty rewards.
- **Phase 6:** Management analytics, financial reporting, and administrative dashboards.

