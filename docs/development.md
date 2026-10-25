# Developer Guide: AY Pizza Mobile Platform

**Project:** AY Pizza Production-Ready Mobile Ordering Application  
**Phase:** Phase 2 Product Catalog Browsing, Customizer Engine & Local Cart  
**Date:** October 2026  

---

## 1. Prerequisites

Before running the application or applying migrations, ensure your machine satisfies the following prerequisites:
- **Node.js:** v22.13.0+ or v24.3.0+ (Tested on Node.js v25.1.0).
- **npm:** v10+ or v11+.
- **Expo CLI:** Managed via `npx expo`.
- **Git:** Version control.
- **Physical Device or Simulator:**
  - iOS: Xcode Simulator (macOS) or Expo Go app on iPhone.
  - Android: Android Studio Emulator or Expo Go app on Android device.

---

## 2. Quickstart Installation

1. **Clone and Install Dependencies:**
   ```bash
   git clone <repo-url> "AY PIZZA MOBILE"
   cd "AY PIZZA MOBILE"
   npm install
   ```

2. **Configure Environment Variables:**
   Copy the provided `.env.example` template to `.env`:
   ```bash
   cp .env.example .env
   ```
   Populate with your project credentials:
   ```ini
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
   EXPO_PUBLIC_APP_ENV=development
   ```

3. **Verify Typecheck, Expo Doctor and Test Suite:**
   ```bash
   # Run strict TypeScript compiler check
   npx tsc --noEmit

   # Run Expo Doctor dependency and health diagnostic (20/20 checks)
   npx expo-doctor

   # Execute the automated test suite (204 tests across 16 test suites)
   npm test
   ```

4. **Launch the Expo Development Server:**
   ```bash
   npm start
   # Or press 'a' for Android emulator, 'i' for iOS simulator, 'w' for web
   ```

---

## 3. Architecture & Domain Structure

```
src/
├── components/          # Presentation components
│   ├── CategoryBar.tsx          # Horizontal category pill selector
│   ├── ProductCard.tsx          # Menu product card with price & stock badges
│   ├── ProductDetailModal.tsx   # Detailed item overview & dietary notes
│   ├── CustomizerModal.tsx      # Interactive customizer (sizes, toppings, half & half)
│   ├── LandmarkPickerModal.tsx  # Modal selector for 19 UNILAG delivery zones
│   ├── CartView.tsx             # Persistent shopping cart with in-place item editing
│   ├── CheckoutModal.tsx        # Customer information form & authoritative price review
│   ├── PaystackPaymentModal.tsx # Paystack payment session modal & sandbox simulator
│   └── OrderReceiptModal.tsx    # Confirmed order receipt with unguessable token
├── domains/             # Core business logic & models
│   ├── catalog/         # Catalog repository, categories, and provisional seeds
│   ├── customizer/      # Sizing, Half & Half surcharges, flavor limits & item hashing
│   ├── cart/            # AsyncStorage cart store, quantity management & reconciliation
│   ├── delivery/        # Landmark fee resolver & UNILAG zones
│   ├── order/           # Authoritative price engine, guest receipt store (SecureStore) & order service
│   ├── payment/         # Paystack provider, payment service & transaction types
│   ├── auth/            # RBAC and session evaluation
│   └── audit/           # Tamper-evident audit logging
├── types/               # TypeScript domain interfaces
├── constants/           # Palette tokens, brand constants & store hours
└── config/              # Safe client environment isolation & Supabase client
```

---

## 4. Customizer Engine & Cart Workflows

### 4.1 Customization Engine
The customizer engine (`src/domains/customizer/customizer-engine.ts`) handles configuration:
- **Sizes:** Regular (+₦0), Standard (+₦1,500), Large (+₦3,000), Queen (+₦5,000), King (+₦7,000).
- **Half & Half Pizza Builder:**
  - Dynamic surcharge: Regular & Standard = +₦1,000; Large, Queen & King = +₦1,500.
  - Secondary flavor selection filtered to in-stock pizzas different from the primary flavor.
- **Desserts:** Milkshake and soft-serve ice cream cup flavor selections constrained to max 2 flavors with up to 8 dessert toppings (+₦1,000 each).
- **Deterministic Hashing:** `generateCustomizerItemHash()` merges identical configurations and keeps distinct configurations separate in the cart.

### 4.2 Local Cart Store
The local cart (`src/domains/cart/cart-store.ts`) persists state via `@react-native-async-storage/async-storage`:
- Storage Key: `@ay_pizza_local_cart_v1` (Versioned Schema Envelope v2).
- **In-Place Item Editing:** Tapping "Edit" re-opens `CustomizerModal` prefilled with the item's configuration and saves changes without creating duplicates.
- **Fulfillment Toggles:** Delivery (19 UNILAG landmarks) vs Pickup at King Jaja Hall (fee ₦0).
- **Catalog Reconciliation:** `reconcileWithCatalog(freshProducts)` verifies live stock status and updates price estimates if menu prices change, setting `isStale: true` and requiring explicit customer acceptance before checkout.

---

## 5. Automated Test Suite Execution

All unit and integration tests execute in isolation:
```bash
npm test
```
Current Status: **194 / 194 Tests Passing** across 15 test suites:
- `phase4-1-kds-operations.test.ts` (Kitchen Display System, RBAC, state machine transitions, concurrent race conditions, audit logging)
- `phase3-1-4-ambiguous-outcome-recovery.test.ts` (Paystack external recovery, timeout reconciliation)
- `phase3-1-3-final-concurrency-and-recovery.test.ts` (Dual reservation locks, external Paystack failure scenarios)
- `phase3-1-2-recovery-and-concurrency.test.ts` (Expo SecureStore guest receipt recovery)
- `phase3-1-1-final-security-verification.test.ts` (HMAC cryptographic token isolation)
- `phase3-1-security-verification.test.ts` (Adversarial payment security verification)
- `phase3-checkout-and-payment.test.ts` (Authoritative pricing, guest checkout, idempotency, Paystack integer kobo, HMAC-SHA512 webhooks)
- `phase2-1-verification.test.ts` (Catalog consistency, production safeguards, corrupted storage recovery)
- `customizer-engine.test.ts` (Sizing, Half & Half dynamic surcharges, flavor bounds, hashing)
- `cart-store.test.ts` (Cart calculations, in-place editing, quantity steppers, fulfillment, persistence)
- `order-calculator.test.ts` (Authoritative price calculations)
- `delivery-service.test.ts` (19 UNILAG campus & mainland landmark rates)
- `catalog-validation.test.ts` (Product validation & dietary policy compliance)
- `auth-roles.test.ts` (Customer, Kitchen, Counter, Manager, Staff, Admin, Rider RBAC)
- `security-and-integrity.test.ts` (RLS policies, anti-escalation, audit immutability)
