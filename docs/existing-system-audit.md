# Existing System Technical Audit: AY Pizza (aypizza.ng)

**Project:** AY Pizza Mobile Application (iOS & Android)  
**Location:** Opposite King Jaja Hall, University of Lagos (UNILAG), Akoka, Lagos, Nigeria  
**Audit Date:** October 21, 2026  
**Auditor:** Mobile Engineering Discovery Subsystem  
**Live Target:** `https://aypizza.ng/`

---

## 1. Executive Summary

A live technical and architectural audit of AY Pizza’s current web presence (`aypizza.ng`) was conducted to evaluate system capabilities, catalog models, authentication paradigms, checkout flows, and determine the viability of backend reuse versus establishing a modern, dedicated API service.

### Key Finding Summary:
1. **Hosting & Server Environment:** Hosted on **Hostinger Shared Hosting** (running hPanel, Hostinger CDN `hcdn`, HTTP/2 & HTTP/3 supported, running PHP 8.3.35).
2. **Architecture:** Monolithic legacy procedural PHP application using server-side rendering, PHP session state (`PHPSESSID`), direct HTML form posts, and client-side Tailwind CSS (loaded via CDN runtime).
3. **Database Layer:** Inferred MySQL/MariaDB relational database (standard Hostinger LAMP stack), verified by dynamic numeric IDs, auto-generated image timestamps, and structured JSON feeds (`fetch_pizza.php?id={id}`).
4. **Existing API Readiness:** **Unsuitable for direct mobile application consumption.** There is no versioned REST API, JWT/token-based authentication mechanism, OpenAPI documentation, or webhook listener architecture. Existing internal JSON endpoints (`fetch_pizza.php`, `fetch_icecream.php`) are read-only helper endpoints meant exclusively for client-side modal rendering.
5. **Payment Gateway:** **Paystack** is already active and verified in production via server-side redirect to `https://checkout.paystack.com/{reference}`.
6. **Chowdeck Status:** The restaurant actively fulfills orders via Chowdeck, but the website has zero software coupling to Chowdeck.

---

## 2. Infrastructure & Hosting Profile

| Parameter | Observed Production Value | Verification Method |
| :--- | :--- | :--- |
| **Domain** | `aypizza.ng` | DNS / HTTP probes |
| **Hosting Provider** | Hostinger International Ltd | Response header `platform: hostinger`, `panel: hpanel` |
| **Content Delivery Network (CDN)** | Hostinger CDN (`Server: hcdn`, cache headers `x-hcdn-request-id`) | HTTP response headers |
| **Web Server / Runtime** | PHP 8.3.35 | Response header `X-Powered-By: PHP/8.3.35` |
| **SSL / TLS** | TLS 1.3 / Let's Encrypt / Hostinger SSL certificate | Active HTTPS probe |
| **Static Asset Storage** | Local directory `/images/` with Unix timestamp prefixes (e.g. `1771612054_11d87ee4...jpeg`) | Inspecting DOM and network requests |
| **Client UI Tech** | Tailwind CSS CDN script (`cdn.tailwindcss.com`), FontAwesome 6.5.0 (`cdnjs`), Vanilla JS | HTML inspection |
| **Operating Hours** | 10:00 AM – 9:00 PM West Africa Time (WAT) daily | Client-side status clock script |

---

## 3. Product Catalog & Menu Data Models

Through direct endpoint analysis, the live menu structure and schema were reverse-engineered:

### 3.1 Pizza Catalog
- **Base Pricing:** Starting base price is uniform across all pizza varieties at **₦7,000.00**.
- **Identified Pizza Varieties (13 unique varieties, 14 legacy records):**
  > *Audit Note (Phase 2.1 Catalog Resolution):* The legacy website database contained 14 menu item records because "Sweet and Sour Pizza" was duplicated under two separate primary keys (ID 18 and ID 11). There are exactly 13 distinct pizza varieties. The Supabase seed migration (`00002_seed_data.sql`) deduplicated this into 13 unique product records.
  1. Sweet and Sour Pizza (ID 18 / ID 11 legacy duplicate)
  2. Club Pizza (ID 17)
  3. Cheese Pepperoni Pizza (ID 16)
  4. Hawaii Pizza (ID 15)
  5. Veggie Deluxe Pizza (ID 14)
  6. Chicken Tikka Pizza (ID 13)
  7. BBQ Beef Pizza (ID 12)
  8. Margherita Pizza (ID 10)
  9. Chicken and Mushroom Pizza (ID 9)
  10. BBQ Chicken Pizza (ID 8)
  11. Sweet Chili Chicken Pizza (ID 7)
  12. Meaty Pizza
  13. Steak Pizza
- **Size Options & Price Adders (Additive on Base):**
  - Regular: +₦0 (Total: ₦7,000)
  - Standard: +₦1,500 (Total: ₦8,500)
  - Large: +₦3,000 (Total: ₦10,000)
  - Queen: +₦5,000 (Total: ₦12,000)
  - King: +₦7,000 (Total: ₦14,000)
- **Extras & Add-ons:**
  - Extra Beef: +₦1,000
  - Extra Cheese: +₦1,000
  - Extra Chicken: +₦1,000
  - Extra Pepperoni: +₦1,000
- **Half & Half Customization:**
  - Dynamic sizing rule: +₦1,000 if size is Regular/Standard; +₦1,500 if size is Large/Queen/King.
  - Allows selecting the flavor for the second half (`half2`) from any active pizza flavor.
- **Special Instructions:** Freeform text input (`comment`), passed through to checkout.

### 3.2 Ice Cream & Milkshake Catalog
- **Milkshake (ID 1):**
  - Sizes: Small Shake (₦4,500), Big Shake (₦5,500)
  - Flavors (Constraint: Max 2 selectable): Vanilla Blast, Strawberry Lovers, Milk and Cookies, Oh Fudge
  - Toppings/Extras: Oreo (+₦1,000), M&M (+₦1,000), Brown Coconut (+₦1,000), Cashew Nut (+₦1,000), Chocolate Syrup (+₦1,000), Caramel Syrup (+₦1,000), Waffle Cone (+₦1,000), Waffle Bowl (+₦1,000)
- **Ice Cream Cups (ID 2):**
  - Sizes: Small Cup (₦3,500), Medium Cup (₦4,500), Big Cup (₦5,500)
  - Flavors (Constraint: Max 2 selectable): Vanilla, Strawberry, Chocolate, Sweet Malt, Bailey, Sweet Cream
  - Toppings/Extras: Same 8 extras as above (₦1,000 each)

### 3.3 Other Menu Items (Fast Food & Refreshments)
- Bottle Water: ₦300.00
- Chicken Lap: ₦3,500.00
- Wing & Chips: ₦5,000.00
- Wings: ₦3,500.00
- Chicken & Chips: ₦5,000.00
- Burger: ₦3,500.00
- Burger & Chips: ₦5,000.00
- Soft Drinks: ₦600.00

---

## 4. Ordering & Delivery Logic

### 4.1 Order Types
1. **Pickup:** No additional fulfillment surcharge.
2. **Delivery:** Delivery fee dynamically calculated via a strict landmark dropdown menu.

### 4.2 Verified Delivery Pricing Matrix (Lagos Mainland / UNILAG Environs)
| Landmark / Zone | Delivery Fee |
| :--- | :--- |
| Inside School (UNILAG Campus) | ₦500 |
| Abule Oja | ₦1,000 |
| Akoka | ₦1,000 |
| Onike | ₦1,000 |
| Iwaya | ₦1,000 |
| Abule Ijesha | ₦1,200 |
| Bariga | ₦1,500 |
| Makoko | ₦2,000 |
| Alagomeji | ₦2,000 |
| Bajuliaye | ₦2,000 |
| Shomolu | ₦2,000 |
| Yaba | ₦2,000 |
| Palmgroove | ₦2,500 |
| Luth (Idi-Araba) | ₦3,000 |
| Onipanu | ₦3,000 |
| Surulere | ₦3,500 |
| Gbagada | ₦4,000 |
| Ebute Meta | ₦4,000 |
| Oworo (Oworonshoki) | ₦4,000 |

*Assessment:* This tiered landmark fee model is essential business logic for AY Pizza. In the mobile application, we must retain this landmark selection or enhance it with precise GPS geo-fencing that maps accurately to these defined rate zones.

---

## 5. Authentication & Customer Profiles

1. **Guest Ordering:** Fully supported on the web platform (`guest_login.php`). Assigns an ephemeral PHP session and collects `guest_email` and `guest_phone` during checkout.
2. **Registered Accounts:** Handled via `login.php` with email/password authentication and a registration modal.
3. **Account Dashboard:** `user.php` enforces registered login; guests are redirected via JavaScript `alert()` back to `index.php`.
4. **Session Mechanism:** Uses standard HTTP cookie `PHPSESSID`. There is no JWT or bearer token issuance, making it unusable for direct REST calls from React Native without custom cookie jar management (which is error-prone and brittle on mobile).

---

## 6. Payment & Order Settlement Flow

1. User adds items to session-backed cart (`add.php`, `add_pizza.php`, `add_icecream.php`).
2. Cart page (`cart.php`) displays order summary and renders checkout form.
3. Submission to `checkout.php` creates an order record in the database and initializes a Paystack transaction via server-side cURL to `https://api.paystack.co/transaction/initialize`.
4. The server responds with `HTTP 302 Found` directing the user's browser to `https://checkout.paystack.com/{access_code}`.
5. Missing / Incomplete components:
   - Dedicated webhook handler (`callback.php` / `verify_payment.php`) returned 404 on direct probe, indicating verification is either inline within `checkout.php` query parameters, or handled strictly via redirect back to a success page.
   - If a customer closes their mobile browser after paying on Paystack without redirecting back, there is high risk of orphaned transactions unless an idempotent server webhook is in place.

---

## 7. Operational & Technical Deficiencies in Existing System

1. **No Mobile API Surface:** The current system cannot power a React Native app as-is.
2. **Coupled Business Logic:** Cart state is bound to server sessions on a single web server instance, preventing stateless horizontal scaling.
3. **No Real-Time Kitchen / POS Display System (KDS):** Orders placed online generate database rows, but dispatch alerts rely on manual checks or email notifications.
4. **No Inventory Synchronization:** Menu availability (`status: 1`) is binary and static; there is no stock-level tracking or automatic item deactivation when ingredients run out.
5. **No Push Notification Infrastructure:** Web sessions have no mechanism for APNs or FCM push notification dispatch.
6. **No Automated Chowdeck Synchronization:** Chowdeck orders are handled completely out-of-band via Chowdeck’s merchant tablet/terminal.
