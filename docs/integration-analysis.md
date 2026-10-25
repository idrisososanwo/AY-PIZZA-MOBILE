# Integration Analysis: External & Internal Ecosystem

**Project:** AY Pizza Mobile Application (iOS & Android)  
**Target:** AY Pizza (UNILAG, Nigeria)  
**Date:** October 21, 2026  

---

## 1. Overview

This document presents a rigorous integration analysis covering all external services, payment gateways, delivery platforms, and potential backend reuse strategies. Each integration is evaluated against verified production realities, developer access constraints, and Nigerian operational realities.

---

## 2. Paystack Integration Analysis

### 2.1 Current State
- **Verified Fact:** AY Pizza already possesses an active Paystack merchant integration on `aypizza.ng`, using currency `NGN`.
- **Existing Flow:** Traditional web checkout redirects via standard 302 HTTP response to Paystack Hosted Checkout (`https://checkout.paystack.com/{access_code}`).

### 2.2 Mobile Integration Strategy
For a production React Native / Expo application, two primary integration patterns exist:

| Criterion | Pattern A: Paystack Mobile SDK / In-App WebView | Pattern B: Hosted Checkout via In-App Browser (`expo-web-browser`) |
| :--- | :--- | :--- |
| **User Experience** | Seamless, native look-and-feel inside the app. | Opens a secure sheet overlaying the application. |
| **Payment Channels** | Debit/Credit Cards, Bank Transfer, USSD, Apple Pay. | Debit/Credit Cards, Bank Transfer, USSD, Apple Pay, QR, OPay. |
| **Compliance / PCI-DSS** | Handled securely via Paystack tokenization; app never touches raw card PAN. | Zero PCI scope; fully hosted on Paystack infrastructure. |
| **Expo Compatibility** | High with `@paystack/react-native` or WebView wrapper. | 100% compatible with zero native dependencies. |
| **Recommendation** | **Primary (Pattern A)** with standard in-app modal / custom Paystack WebView wrapper. | **Fallback (Pattern B)** if native SDK faces store policy edge cases. |

### 2.3 Webhook & Settlement Architecture
A critical vulnerability in simple mobile payment flows is reliance on client-side success callbacks. If a student pays via USSD or Bank Transfer and switches apps, or their connection drops before returning to the app, the transaction could be marked as unpaid.

**Required Production Implementation:**
1. **Transaction Initialization (`POST /api/v1/orders/initialize`):**
   - Backend calls Paystack `https://api.paystack.co/transaction/initialize` with unique order reference and customer email.
   - Generates temporary order in `pending_payment` state with an expiration TTL (e.g., 15 minutes).
2. **Server-to-Server Webhook (`POST /api/v1/webhooks/paystack`):**
   - Validates Paystack HMAC SHA512 signature using the `PAYSTACK_SECRET_KEY`.
   - Listens for `charge.success` event.
   - Idempotently transitions order status from `pending_payment` to `paid` and `confirmed`.
   - Dispatches instant kitchen alert (via WebSocket / Supabase Realtime / Expo Push).
3. **Transaction Verification Endpoint (`POST /api/v1/orders/verify`):**
   - Allows mobile app to actively poll backend upon returning from payment interface, verifying server state without waiting for webhook latency.

---

## 3. Chowdeck Integration Analysis

### 3.1 Verified Facts vs. Unverified Assumptions
- **Verified Fact 1:** AY Pizza is an active restaurant on Chowdeck, fulfilling orders for UNILAG students and mainland Lagos residents.
- **Verified Fact 2:** Chowdeck provides a public merchant API (`https://api.chowdeck.com/merchant`, documented at `chowdeck-api.readme.io`).
- **Verified Fact 3:** Chowdeck API supports order lifecycle webhooks (`ORDER_CREATED`), menu synchronization, and logistics dispatch via *Relay by Chowdeck*.
- **Unverified Assumption A (Requires Merchant Confirmation):** We do not yet know whether AY Pizza's Chowdeck account has been granted Developer API credentials, or if their tier allows custom webhook registration.
- **Unverified Assumption B:** We must not assume that Chowdeck allows external mobile apps to inject orders into Chowdeck's marketplace queue without high merchant commission fees.

### 3.2 Strategic Approaches to Chowdeck

#### Approach 1: Dual Independent Channels (Recommended for Phase 1)
- **Concept:** Treat the mobile app as AY Pizza's **Direct-to-Consumer (D2C)** channel with zero Chowdeck commissions, superior loyalty rewards, and direct student relationships.
- **Operation:**
  - Chowdeck continues operating independently on the restaurant’s existing Chowdeck tablet.
  - Mobile app orders arrive directly at an AY Pizza Kitchen Display / Tablet or WhatsApp dispatch printer.
- **Pros:** Zero integration blockers; immediate launch; protects AY Pizza’s gross margins (saving 20–30% platform commissions).
- **Cons:** Staff must view two screens (Chowdeck tablet + AY Pizza app tablet).

#### Approach 2: Chowdeck Relay (Delivery-as-a-Service Logistics Integration)
- **Concept:** AY Pizza receives orders via the new mobile app, collects payment directly via Paystack, and calls Chowdeck's *Relay API* solely to dispatch a rider for delivery outside campus.
- **Pros:** Solves delivery logistics for distant mainland deliveries (e.g., Surulere, Gbagada) without hiring full-time bike riders.
- **Cons:** Requires active Relay developer agreement and credit wallet pre-funding with Chowdeck.

#### Approach 3: Full Two-Way Synchronization (API Bridge)
- **Concept:** Bi-directional sync of menu inventory and incoming orders between Chowdeck API and the AY Pizza backend.
- **Assessment:** Technically viable if AY Pizza provides API credentials, but introduces severe operational complexity and dependency on third-party API uptime. Recommended only as a future Phase 3 optimization if staff order fatigue is confirmed.

---

## 4. Existing Backend & Database Reuse Evaluation

We rigorously evaluated three technical paths for the backend architecture:

### Option 1: Direct Integration with Existing Hostinger PHP/MySQL
- **Description:** Expose new PHP scripts or reverse-engineer existing endpoints (`add_pizza.php`, `fetch_pizza.php`) to serve as the mobile app API.
- **Evaluation:** **REJECTED.**
  - *Security:* Hostinger shared hosting environment exposes shared IP risks, lack of rate limiting, and SQL injection vulnerability surface in legacy procedural scripts.
  - *Stateless Mobile Requirements:* Existing code is tightly coupled to PHP sessions (`PHPSESSID`) and HTML redirect flows.
  - *Capabilities:* Lacks modern features needed for mobile: JWT/OAuth2 authentication, push notification triggers, WebSocket real-time order tracking, and ACID-compliant transactional guarantees for loyalty points.

### Option 2: Hybrid Sync Bridge (Modern Backend syncing with Hostinger MySQL)
- **Description:** Build a modern backend (e.g. Node.js/PostgreSQL) and write cron jobs or database replication to mirror data into the existing Hostinger MySQL database.
- **Evaluation:** **NOT RECOMMENDED.**
  - Introduces split-brain database states, latency, fragile SSH/remote MySQL connections (often firewalled on shared hosting), and high ongoing maintenance.

### Option 3: Clean Modern Headless Backend (Recommended)
- **Description:** Establish a dedicated, production-grade modern backend (TypeScript / Node.js with PostgreSQL or Supabase / NestJS).
- **Evaluation:** **STRONGLY RECOMMENDED.**
  - Full control over schema, security, role-based access control (RBAC), and push notifications.
  - Supports offline-first mobile state caching via React Query / Zustand.
  - Can provide a clean, modern Restaurant Management / Kitchen Display interface for tablet/web that supersedes the legacy Hostinger admin.
  - Can import AY Pizza’s existing verified menu catalog immediately during database seeding.

---

## 5. Notification & Communication Integrations

### 5.1 Push Notifications
- **Service:** Expo Application Services (EAS) Push Notifications (`expo-notifications`).
- **Platform Bridges:**
  - Android: Firebase Cloud Messaging (FCM v1 HTTP API).
  - iOS: Apple Push Notification service (APNs) via EAS credentials.
- **Use Cases:**
  - Order status updates ("Order Received", "Baking in Oven", "Out for Delivery", "Ready for Pickup").
  - Promotional flash discounts (e.g., "UNILAG Late Night Pizza Deal - 15% off until 9 PM").
  - Cart abandonment reminders.

### 5.2 SMS & WhatsApp Integrations (Nigerian Context)
- **Service Options:** **Termii** or **Twilio** (Termii is the undisputed industry standard for Nigerian telecom routing across MTN, Airtel, Glo, and 9mobile).
- **Use Cases:**
  - Phone Number Verification via 6-digit OTP (crucial for Nigerian student users who frequently forget passwords).
  - WhatsApp Business order receipts and real-time dispatch updates for customers who disable push notifications.
