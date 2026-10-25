# Phase 0 Discovery Report: AY Pizza Mobile Application

**Project:** AY Pizza Production-Ready Customer Mobile Application  
**Client:** AY Pizza (Opposite King Jaja Hall, University of Lagos, Akoka, Lagos, Nigeria)  
**Target Platforms:** iOS & Android (React Native, Expo, TypeScript)  
**Date of Completion:** October 21, 2026  
**Status:** Phase 0 Discovery Completed — Awaiting Approval Before Implementation  

---

## 1. Executive Summary

This Discovery Report documents the findings of our comprehensive Phase 0 technical and operational investigation for AY Pizza’s new production mobile application. 

AY Pizza is an established, high-demand culinary fixture at the University of Lagos (UNILAG). While the restaurant enjoys steady demand across walk-in customers, phone calls, WhatsApp, Chowdeck, and an existing website (`https://aypizza.ng`), its digital channels operate in silos. High third-party aggregator commissions (up to 20–30% on Chowdeck), unverified bank transfers on WhatsApp, and an unoptimized website limit profitability and customer retention.

Our live audit verified that:
1. The existing website runs on **Hostinger shared hosting using procedural PHP 8.3 and MySQL**, tightly coupled to server-side cookies (`PHPSESSID`) and HTML form posts. It **lacks a production REST/JWT API** and is unsuitable for direct mobile consumption.
2. **Paystack payment processing is already operational** on the website, establishing that the business has verified merchant banking facilities ready for mobile app transactions.
3. The restaurant has an exact, proven **menu customization model** (14 pizza varieties, tiered size multipliers, half-and-half flavor splitting, milkshake/ice cream flavor caps, and specific campus/mainland landmark delivery fees) that must be faithfully preserved and elevated in the mobile app.
4. **Chowdeck has a developer API**, but AY Pizza’s account tier is unverified; building the mobile app as a direct, commission-free D2C channel with zero third-party dependencies will deliver the fastest time-to-market and highest gross profit.

---

## 2. Key Findings & System Audit

### 2.1 The Existing Website (`https://aypizza.ng`)
- **Hosting Environment:** Hostinger Shared Hosting (hPanel), served via Hostinger CDN (`Server: hcdn`), PHP 8.3.35, TLS 1.3.
- **Frontend Stack:** HTML5, Tailwind CSS via client-side runtime script (`cdn.tailwindcss.com`), FontAwesome 6.5.0, Vanilla JavaScript.
- **Brand Colors:**
  - `night`: `#2b1a12` (Dark chocolate)
  - `royal`: `#4a2c1a` (Coffee brown)
  - `frost`: `#ffe8d6` (Creamy frost)
  - `lava`: `#d97706` (Crust orange / primary brand accent)
  - `neon`: `#fbbf24` (Cheese yellow)
- **Store Hours:** 10:00 AM – 9:00 PM WAT daily.
- **API Surface:** Only internal helper scripts exist (`fetch_pizza.php?id={id}`, `fetch_icecream.php?id={id}`) returning partial JSON for DOM modals. No authenticated REST endpoints, no Swagger/OpenAPI, and no JWT token issuance.

### 2.2 Reverse-Engineered Product Catalog
| Category | Offerings | Pricing & Multipliers | Customization Rules |
| :--- | :--- | :--- | :--- |
| **Pizza (14 Varieties)** | Sweet & Sour, Club, Cheese Pepperoni, Hawaii, Veggie Deluxe, Chicken Tikka, BBQ Beef, Margherita, Chicken & Mushroom, BBQ Chicken, Sweet Chili Chicken, Meaty, Steak. | Base: **₦7,000.00**<br>• Regular (+₦0)<br>• Standard (+₦1,500)<br>• Large (+₦3,000)<br>• Queen (+₦5,000)<br>• King (+₦7,000) | • Extras: Beef, Cheese, Chicken, Pepperoni (+₦1,000 ea)<br>• Half & Half: +₦1,000 (Reg/Std) or +₦1,500 (Lrg/Qn/Kng) with secondary flavor selection<br>• Special kitchen notes. |
| **Milkshakes** | Small Shake (₦4,500), Big Shake (₦5,500). | Fixed by size. | Choose up to 2 flavors (Vanilla Blast, Strawberry Lovers, Milk & Cookies, Oh Fudge) + 8 optional toppings (+₦1,000 ea). |
| **Ice Cream Cups** | Small Cup (₦3,500), Medium Cup (₦4,500), Big Cup (₦5,500). | Fixed by size. | Choose up to 2 flavors (Vanilla, Strawberry, Chocolate, Sweet Malt, Bailey, Sweet Cream) + 8 optional toppings (+₦1,000 ea). |
| **Other Menu** | Fast Food & Refreshments. | Fixed pricing (e.g. Water ₦300, Wings ₦3,500, Chicken & Chips ₦5,000, Burger ₦3,500, Soft Drinks ₦600). | Direct add to cart without modal. |

### 2.3 Delivery Fee Structure (Landmark Matrix)
AY Pizza operates a battle-tested landmark delivery fee matrix:
- **UNILAG Campus (Inside School / Hostels):** ₦500 flat fee.
- **Adjacent Communities:** Akoka (₦1,000), Abule Oja (₦1,000), Onike (₦1,000), Iwaya (₦1,000), Abule Ijesha (₦1,200), Bariga (₦1,500).
- **Greater Mainland:** Makoko (₦2,000), Alagomeji (₦2,000), Bajuliaye (₦2,000), Shomolu (₦2,000), Yaba (₦2,000), Palmgroove (₦2,500), Luth (₦3,000), Onipanu (₦3,000), Surulere (₦3,500), Gbagada (₦4,000), Ebute Metta (₦4,000), Oworo (₦4,000).

---

## 3. Recommended Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AY PIZZA MOBILE APP                             │
│       React Native (Expo SDK, TypeScript, NativeWind / StyleSheet)     │
│   iOS (App Store)                       Android (Google Play Store)    │
└───────────────────▲────────────────────────────────▲───────────────────┘
                    │                                │
            REST / WebSocket                 Push Notifications
                    │                          (Expo / APNs / FCM)
┌───────────────────▼────────────────────────────────┴───────────────────┐
│                     MODERN API BACKEND & DATABASE                     │
│               Supabase / PostgreSQL OR Node.js / NestJS               │
│                                                                        │
│  • Auth Service (Phone OTP + Social)     • Order State Machine         │
│  • Menu & Customizer Engine              • Webhook Listener (Paystack) │
│  • Loyalty & Slice Rewards Engine        • KDS Realtime Stream         │
└───────────────▲───────────────────────────────────────▲────────────────┘
                │                                       │
     Paystack Payment Gateway              Kitchen Display System (KDS)
   (Cards, Transfers, USSD, Apple Pay)    (Tablet Web App behind counter)
```

### 3.1 Technology Stack Rationale
1. **Frontend Mobile Application:**
   - **Framework:** React Native with Expo (Managed Workflow, TypeScript).
   - **Styling:** Custom theme matching AY Pizza's warm chocolate, frost cream, and lava crust orange palette (`#2b1a12`, `#ffe8d6`, `#d97706`).
   - **State Management & Caching:** TanStack React Query (server state & caching) + Zustand (client cart & active order persistence).
   - **Offline Resilience:** Local persistence with encrypted storage.
2. **Backend & Database:**
   - **Primary Recommendation:** **Supabase + PostgreSQL**. Provides native PostgreSQL, instant Realtime WebSocket engine for kitchen order synchronization, built-in Row-Level Security (RLS), and zero DevOps server management.
   - **Alternative:** Custom Node.js (NestJS / Fastify) with PostgreSQL on Render or Railway if the restaurant requires fully self-hosted infrastructure.
3. **Payments:**
   - Paystack Mobile SDK / WebView checkout, validated by an idempotent backend webhook listener and automated reconciliation cron.
4. **Kitchen Operations:**
   - Responsive web-based Kitchen Display System (KDS) running on a tablet at the UNILAG counter, alerting staff with an audible alarm upon incoming orders.

---

## 4. Proposed Implementation Phases

### Phase 1: Foundation, Backend API & Architecture Setup
- Initialize the Expo TypeScript project (`/app` structure, design tokens, typography, theme colors).
- Set up the PostgreSQL database schema (Products, Variants, Sizes, Extras, Landmarks, Orders, OrderItems, Customers, LoyaltyLedger).
- Seed the database with the verified AY Pizza catalog.
- Build and verify core REST endpoints with OpenAPI specifications.

### Phase 2: Catalog Browsing, Customizer Engine & Local Cart
- Develop the high-conversion mobile UI: Hero banners, category tabs, and search.
- Build the Interactive Pizza Customizer: Size selector, topping checklist, Half & Half builder, and special notes.
- Build the Milkshake and Ice Cream Customizer: 2-flavor limit enforcer and topping selector.
- Implement the local cart engine with offline persistence and UNILAG landmark delivery calculations.

### Phase 3: Authentication, Paystack Checkout & Order State Machine
- Implement Nigerian Phone OTP onboarding (via Termii / WhatsApp OTP) and Guest Checkout.
- Wire the Paystack checkout flow (Cards, Bank Transfer, USSD).
- Implement the server-side Paystack webhook listener with HMAC-SHA512 verification and idempotency keys.
- Create itemized digital receipts with WhatsApp sharing.

### Phase 4: Kitchen Display System (KDS) & Real-Time Tracking
- Build the tablet-optimized Kitchen Display System with loud audible chimes and one-tap status updates (`Accept`, `Preparing`, `Ready`, `Delivered`).
- Implement real-time customer tracking screen with animated order milestone progress.
- Configure Expo Push Notifications (APNs & FCM) for automated status broadcasts.

### Phase 5: Loyalty System ("Slice Rewards") & Retention Loops
- Implement loyalty point accumulation (5% effective cashback on every order).
- Implement the "Give ₦500, Get ₦500" student referral mechanism.
- Add "1-Tap Reorder" and favorite items for frictionless repeat purchases.

### Phase 6: Quality Assurance, Hardening & App Store Deployment
- End-to-end testing on physical iOS and Android devices.
- Network latency simulation (testing order submission under poor 2G/3G campus signal).
- Production build via Expo Application Services (EAS Build).
- App Store & Google Play submission and store listing optimization.

---

## 5. Unresolved Questions for Project Stakeholders

Before beginning Phase 1 code implementation, the following operational questions should be answered by the restaurant owner:

1. **Kitchen Counter Hardware:** What device is currently available behind the counter opposite King Jaja (Android tablet, iPad, or laptop)?
2. **Paystack Credentials:** Will the mobile app use AY Pizza's existing Paystack account, or should a dedicated sub-account be generated for mobile revenue segregation?
3. **Campus Delivery Fleet:** Are deliveries inside UNILAG fulfilled by in-house student runners, bicycle dispatch, or external bikes?
4. **Chowdeck Relationship:** Does AY Pizza desire to maintain Chowdeck as an independent secondary marketplace channel (recommended), or request an enterprise API key for menu sync?

---

## 6. Deliverables Reference Guide

All discovery deliverables have been compiled in the `/docs` directory:
- [Existing System Audit](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/docs/existing-system-audit.md)
- [Integration Analysis](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/docs/integration-analysis.md)
- [Product Requirements Outline](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/docs/product-requirements-outline.md)
- [Technical Risks Matrix](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/docs/technical-risks.md)
- [Open Decisions](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/docs/open-decisions.md)
- [Discovery Report](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/docs/discovery-report.md)
