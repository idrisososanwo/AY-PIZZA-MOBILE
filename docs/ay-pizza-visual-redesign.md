# AY Pizza — Visual Identity & Customer App UI Redesign

**Project:** AY Pizza Production-Ready Customer Mobile Application  
**Target Venue:** Opposite King Jaja Hall, University of Lagos (UNILAG), Akoka, Lagos, Nigeria  
**Scope:** Visual Identity, Design Tokens, Bundled Commercial Photography, Customer App UI Overhaul & Responsive Experience  
**Date:** October 2026  
**Status:** ✅ Completed & Formally Verified  

---

## 1. Executive Summary & Design Direction

Following Phase 4.2.1, the AY Pizza customer application possessed a functional frontend, robust PostgreSQL schema, authoritative order-creation RPCs, Paystack payment processing, hardware-backed guest receipt storage, and real-time push tracking infrastructure. However, the interface inherited a dark espresso palette from the legacy website that muted product appetite appeal and diminished brand recognition.

We executed a comprehensive visual redesign inspired by modern QSR (Quick Service Restaurant) leaders like Domino's and KFC—emphasizing high brand recognition, bold contrast, appetite-driven food photography, clear hierarchy, and prominent calls-to-action—while creating a distinct, vibrant identity specifically tailored for AY Pizza at the University of Lagos.

### Core Philosophy
1. **Bold & Youthful Energy:** Primary Red (`#C9232B`) paired with Golden Yellow (`#F4B323`) accents provides immediate brand impact and appetite stimulation.
2. **Warm, Appetizing Canvas:** Replaced dark brown surfaces with Warm Cream (`#FFF8EC`) and elevated Pure White (`#FFFFFF`) cards.
3. **Appetite-Driven Imagery:** Authentic, high-resolution bundled food photography showing golden crusts, melted cheese, loaded milkshakes, and crispy tenders.
4. **Mobile-First Ergonomics:** 44px+ touch targets, clear size pill selectors, sticky bottom actions, and contrast meeting WCAG AA standards.
5. **Zero Backend Regression:** Strictly preserved authoritative database calculations, RLS policies, Paystack integrations, and order state machines.

---

## 2. Color System & Design Tokens

Defined in [`src/constants/colors.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/constants/colors.ts):

| Token Name | Hex Code | Purpose & Semantic Role |
| :--- | :--- | :--- |
| `primaryRed` / `lava` | `#C9232B` | Primary action buttons, brand crest, active tab highlights, promotional badges |
| `goldenYellow` / `gold` | `#F4B323` | Campus delivery badges, UNILAG crest, promotional highlights, cheese accents |
| `warmCream` / `night` | `#FFF8EC` | Primary application canvas, background, spacious layout areas |
| `charcoal` / `frost` | `#27211F` | High-contrast typography, icons, card borders, display titles |
| `cardWhite` / `royal` | `#FFFFFF` | Elevated product cards, modal containers, interactive inputs |
| `freshGreen` / `green` | `#287A4B` | Verified receipt tokens, in-stock availability indicators, live tracking pulses |
| `softTomato` | `#FCE5E2` | Subtle badge backgrounds, price container pills, order receipt badges |
| `textSecondary` / `muted` | `#6B5E59` | Subtitles, ingredients, size helpers, timestamps |

---

## 3. Typography Scale & Layout Architecture

Defined in [`src/constants/theme.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/constants/theme.ts):

- **Display Headings:** `28px` / Heavy `900` / Charcoal `#27211F` or White `#FFFFFF` on Red/Photo overlays.
- **Page Headings:** `22px` / Bold `900` / Primary Red `#C9232B` (`AY PIZZA` brand title).
- **Section Headings:** `16px–18px` / ExtraBold `800` / Charcoal `#27211F`.
- **Product Titles:** `15px` / ExtraBold `800` / High-contrast Charcoal `#27211F`.
- **Prices:** `15px` / Black `900` / Primary Red `#C9232B`.
- **Body & Descriptions:** `13px` / Regular `400` / Warm Muted `#6B5E59`.
- **Badges & Tags:** `10px–11px` / Heavy `900` / Letter-spaced uppercase.
- **Button CTAs:** `14px–16px` / Black `900` / Pure White `#FFFFFF` on Red CTA.

---

## 4. Bundled Commercial Food Photography

To ensure reliable offline support, instant rendering, and zero risk of broken remote URLs, 5 commercial-grade food photography assets were bundled under `assets/images/` and indexed in [`src/constants/images.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/constants/images.ts):

1. **Hero Promo Banner** (`assets/images/hero_banner.jpg`): Stone-oven baked pizza with melted cheese pull, fresh basil, and rustic flour crust.
2. **Pepperoni Pizza** (`assets/images/pepperoni.jpg`): Sliced gourmet pepperoni pizza with crispy edges on a dark wooden peel.
3. **BBQ Chicken Pizza** (`assets/images/bbq_chicken.jpg`): Smoky BBQ chicken pizza with golden corn kernels, red onions, and bell peppers.
4. **Gourmet Milkshake** (`assets/images/milkshake.jpg`): Creamy loaded milkshake with whipped cream, chocolate drizzle, and waffle stick.
5. **Crispy Chicken & Sides** (`assets/images/crispy_chicken.jpg`): Golden-brown crispy chicken strips and seasoned potato wedges.

---

## 5. Screen-by-Screen Redesign Details

### 5.1. Header & Promotional Hero Section
- **Brand Identity:** Bold `🍕 AY PIZZA` wordmark in Primary Red with a golden `UNILAG` badge.
- **Location Selector:** Clear location chip: `📍 Opposite King Jaja Hall • Campus Delivery`.
- **Cart Button:** Warm cream rounded pill with an active red counter circle displaying live item count.
- **Hero Promotional Banner:** High-impact hero card featuring real stone-oven pizza photography, gold delivery tag (*"⚡ HOT & FRESH FROM JAX OVEN"*), bold headline (*"Craving Real Artisan Pizza?"*), and campus timing badge (*"⏱️ 15–25 Mins UNILAG Campus Delivery"*).

### 5.2. Category Navigation & Product Discovery
- **CategoryBar:** Elevated white container with rounded category pills (All, Pizza, Shakes & Ice Cream, Fastfood, Drinks). Active pill renders in solid Primary Red with white text.
- **Product Cards:** Crisp white cards elevated with soft shadows, food photography thumbnail, in-stock status tag, bold title, item description, primary red price, and rounded "Add +" or "Customize" action.

### 5.3. Product Details & Customization Modals
- **Product Detail Modal:** Full-bleed food photography header with gradient protection, title, description, size selector pills (Regular, Standard, Large, Queen, King), live pricing update, and sticky red action CTA.
- **Interactive Customizer Modal:** Clean white card sections for Crust selection, Extra Toppings, and Half & Half secondary pizza selection with live price breakdown.

### 5.4. Cart & Checkout Experience
- **Cart View:** Delivery vs Pickup toggle switch with purple/cyan accents, landmark selector for UNILAG hostels, itemized cart item rows with quantity steppers and delete actions, fee breakdown, and bold Red checkout button.
- **Checkout Modal:** Accessible form inputs for Customer Name, Nigerian phone number (`+234`), optional email, order notes, item review, price discrepancy protection, and Paystack payment action.

### 5.5. Order Receipts, History & Live Tracking
- **Order Receipts:** Celebratory receipt card with date/time stamp, order number, verified receipt token, and dual action: "Track Order Live 📡" (Primary Red) or "Back to Menu".
- **Orders Tab:** Stored hardware-backed guest receipt records presented in crisp white cards with order ID, date, verified tag, and 1-tap "Track Live" button.
- **Order Tracking Modal:** Authoritative status timeline (Confirmed → Accepted → Baking → Ready → Delivered), live Realtime indicator, and notification toggle.

### 5.6. Staff Kitchen Display System (KDS)
- Preserved operational density, dark lane contrast, timer badges, and role verification at `/kitchen` while adopting AY Pizza typography and status indicators.

---

## 6. Verification & Test Evidence

### 6.1. Automated Test Suite (Jest)
Executed `npm test`:
```
PASS src/__tests__/phase4-2-1-adversarial-review.test.ts (21.628 s)
PASS src/__tests__/phase4-2-tracking-and-notifications.test.ts (32.196 s)
PASS src/__tests__/phase2-1-verification.test.ts (10.246 s)
PASS src/__tests__/order-calculator.test.ts
PASS src/__tests__/delivery-service.test.ts
PASS src/__tests__/phase3-checkout-and-payment.test.ts (32.847 s)
PASS src/__tests__/phase3-1-3-final-concurrency-and-recovery.test.ts
PASS src/__tests__/auth-roles.test.ts
PASS src/__tests__/phase3-1-1-final-security-verification.test.ts
PASS src/__tests__/customizer-engine.test.ts
PASS src/__tests__/catalog-validation.test.ts
PASS src/__tests__/phase3-1-security-verification.test.ts
PASS src/__tests__/phase3-1-2-recovery-and-concurrency.test.ts
PASS src/__tests__/phase3-1-4-ambiguous-outcome-recovery.test.ts
PASS src/__tests__/phase4-1-kds-operations.test.ts
PASS src/__tests__/phase4-1-1-kds-adversarial-verification.test.ts
PASS src/__tests__/cart-store.test.ts
PASS src/__tests__/phase4-1-3-kds-corrections.test.ts
PASS src/__tests__/security-and-integrity.test.ts

Test Suites: 19 passed, 19 total
Tests:       248 passed, 248 total
Snapshots:   0 total
Time:        50.216 s
```

### 6.2. Static Typecheck (TypeScript)
Executed `npx tsc --noEmit`:
```
Exit code: 0 (Zero errors)
```

### 6.3. Project Health Check (Expo Doctor)
Executed `npx expo-doctor`:
```
Running 20 checks on your project...
20/20 checks passed. No issues detected!
```

### 6.4. Production Export Bundles
- **Web Export:** `npx expo export -p web` (Exit code: 0, 5 assets statically packaged, 1MB bundle).
- **Android Export:** `npx expo export -p android` (Exit code: 0, 5 assets bundled, 2.6MB Hermes bytecode).

### 6.5. Browser Subagent Visual Inspection
Inspected running Metro web instance at `http://localhost:8081/` across mobile (390x844) and desktop viewports:
- Captured screenshots:
  - `ay_pizza_home_1792709531279.png` (Home screen with header, hero banner, category pills, product grid)
  - `ay_pizza_main_1792709690218.png` (Product detail modal with large food imagery)
  - `ay_pizza_cart_view_1792710343285.png` (Cart view with warm cream canvas)
  - `ay_pizza_orders_tab_1792710447995.png` (Orders history tab)
  - `ay_pizza_phase_status_1792710511392.png` (Phase status documentation)
  - `ay_pizza_kitchen_1792710689998.png` (Kitchen Display System)
- Full session video recording saved to:
  `visual_verification_1792709477769.webp`

---

## 7. Responsiveness & Accessibility

- **Mobile First:** Optimized for handheld devices (360px–430px wide), ensuring all touch targets exceed 44x44px.
- **Safe Area Insets:** Tested with SafeAreaView across top status bar and bottom gesture bars.
- **Color Contrast:** All body text meets WCAG AA standard (Charcoal `#27211F` on Warm Cream `#FFF8EC` has contrast ratio > 11:1; Pure White on Primary Red `#C9232B` has contrast ratio > 4.6:1).
- **No Mock Catalog Data:** Uses live catalog repository with authoritative price tags.

---

## 8. Remaining Limitations & Phase 4.3 Boundary

1. **Live Owner Photography:** While high-quality commercial photography assets are bundled, on-site photography of AY Pizza's exact physical kitchen and packaging can replace these assets seamlessly via `assets/images/`.
2. **Phase Boundary:** In strict accordance with user constraints, Phase 4.3 (Loyalty points, coupon codes, and customer referral mechanisms) has **not** been started. All database migrations, edge functions, and payment state machines remain intact.
