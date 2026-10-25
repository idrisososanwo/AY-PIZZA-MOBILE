# Product Requirements Outline (PRO): AY Pizza Mobile App

**Project:** AY Pizza Mobile Application (iOS & Android)  
**Target Market:** University of Lagos (UNILAG) Campus & Environs, Lagos, Nigeria  
**Document Version:** 1.0 (Phase 0 Discovery)  
**Date:** October 21, 2026  

---

## 1. Problem Statement & Strategic Objective

AY Pizza has established a beloved physical and digital brand presence at the University of Lagos (Opposite King Jaja Hall). However, its existing digital channels suffer from distinct limitations:
1. **Third-party Aggregators (Chowdeck):** High merchant commissions (20–30%), loss of customer contact data, and platform competition.
2. **WhatsApp / Phone Ordering:** High manual labor cost, human error during peak rush hours, unverified bank transfer receipt fraud, and slow communication.
3. **Legacy Website:** Clunky web forms, absence of push engagement, no loyalty/retention loop, and poor mobile device persistence.

**Core Objective:** Build a high-performance, frictionless React Native / Expo mobile application that transforms AY Pizza into a direct digital ordering powerhouse, boosting customer retention, repeat order frequency, and average order value (AOV) while ensuring kitchen operations remain simple and unified.

---

## 2. Target User Personas

### Persona 1: "The Campus Resident" (UNILAG Undergraduate)
- **Profile:** Lives in campus halls (King Jaja, Moremi, Mariere, New Hall, Biobaku, Madam Tinubu, Eni Njoku).
- **Behavior:** Orders late afternoon or evening during study sessions, hall hangouts, or exam weeks.
- **Pain Points:** Cashless payments failing; riders unable to find hostel porter gate; long queues at walk-in counter.
- **Key Motivator:** Fast hostel delivery, combo deals, loyalty discounts, seamless payment via Bank Transfer / Cards.

### Persona 2: "The Faculty & Administrative Staff"
- **Profile:** Professors, lecturers, and administrative officers in Senate House, faculties, and medical college (LUTH).
- **Behavior:** Orders lunch packages for individual meals or departmental meetings.
- **Key Motivator:** Punctual scheduled delivery, itemized receipts, high food hygiene standards.

### Persona 3: "The Off-Campus Mainland Neighbor"
- **Profile:** Residents and young professionals in Akoka, Yaba, Onike, Abule Oja, and Surulere.
- **Behavior:** Weekend family treats or evening dinners.
- **Key Motivator:** Transparent delivery fees, accurate estimated delivery time, authentic stone-baked quality.

### Persona 4: "The AY Pizza Kitchen Dispatcher / Cashier"
- **Profile:** Restaurant staff managing order queues behind the counter opposite King Jaja.
- **Behavior:** Fast-paced environment with simultaneous walk-ins, phone calls, and digital orders.
- **Key Motivator:** Clear audio alert on new orders; one-tap status updates; zero manual order re-entry.

---

## 3. Core Functional Requirements (Customer Mobile App)

### 3.1 Seamless Onboarding & Authentication
- **FR-AUTH-01 (Phone OTP First):** Fast registration using Nigerian phone number (+234) with SMS/WhatsApp OTP (via Termii) for zero-friction sign-in.
- **FR-AUTH-02 (Social / Apple / Google Sign-In):** One-tap authorization on iOS and Android.
- **FR-AUTH-03 (Guest Checkout):** Allow users to browse, customize, and enter cart as guests, with non-intrusive phone prompt during checkout.
- **FR-AUTH-04 (Biometric Auth):** FaceID / TouchID / Biometric prompt for returning sessions.

### 3.2 Dynamic Menu & Advanced Customization
- **FR-MENU-01 (Category Browsing):** Real-time categorized tabs: Pizza, Ice Cream & Shakes, Chicken & Fast Food, Drinks.
- **FR-MENU-02 (Pizza Customizer):**
  - Size selection: Regular (base ₦7,000), Standard (+₦1,500), Large (+₦3,000), Queen (+₦5,000), King (+₦7,000).
  - Topping add-ons (Extra Beef, Cheese, Chicken, Pepperoni at +₦1,000 each).
  - Half & Half flavor builder (+₦1,000 / +₦1,500 based on size; second flavor picker).
  - Special kitchen notes (e.g. "extra spicy, crisp crust, no onions").
- **FR-MENU-03 (Ice Cream & Shake Customizer):**
  - Milkshake sizes (Small ₦4,500, Big ₦5,500) and Ice Cream cups (Small ₦3,500, Medium ₦4,500, Big ₦5,500).
  - Flavor selector enforcing a maximum of 2 flavors.
  - Topping add-ons (Oreo, M&M, Coconut, Cashew, Syrups, Waffles).
- **FR-MENU-04 (Live Availability Badges):** Visually indicate sold-out items or unavailable toppings in real time.

### 3.3 Cart & Smart Fulfillment Engine
- **FR-CART-01 (Local Cart Persistence):** Cart persists across app restarts using local encrypted storage (`AsyncStorage` / MMKV).
- **FR-CART-02 (Fulfillment Mode Toggle):** Clear choice between **Self-Pickup (Free)** at King Jaja and **Doorstep Delivery**.
- **FR-CART-03 (UNILAG Landmark Matrix):**
  - Campus delivery selector: Select specific UNILAG hostels, faculties, and landmarks (flat ₦500 delivery fee).
  - Off-campus mainland zones: Automated fee mapping (Akoka ₦1,000, Bariga ₦1,500, Yaba ₦2,000, Surulere ₦3,500, etc.).
- **FR-CART-04 (Delivery Instructions):** Specific fields for Room Number / Block Number / Phone backup.

### 3.4 Payment & Checkout Security
- **FR-PAY-01 (Paystack Integration):** Support Debit Cards, Bank Transfer (with instant virtual account), USSD codes (*737#, *894#, etc.), and Apple Pay.
- **FR-PAY-02 (Idempotency & Server Verification):** Server-side verification and webhooks ensure zero duplicate charges or unconfirmed orders.
- **FR-PAY-03 (Digital Receipt):** Immediate in-app itemized invoice with downloadable PDF / image and WhatsApp share option.

### 3.5 Customer Retention, Loyalty & Gamification
- **FR-LOY-01 ("Slice Rewards" Loyalty Program):**
  - Earn 1 "Slice" point for every ₦100 spent (5% effective cashback).
  - Redeem points directly at checkout against future orders (1 Slice = ₦5).
- **FR-LOY-02 (Student Referral Loop):** "Give ₦500, Get ₦500" referral code system encouraging viral peer-to-peer sharing across campus.
- **FR-LOY-03 (Targeted Push Notifications):**
  - Cart abandonment recovery ("Still hungry? Your Margherita pizza is waiting!").
  - Friday evening & match-day push campaigns.
- **FR-LOY-04 (Favorites & 1-Tap Reorder):** Save previous orders for instant reordering during late-night study sessions.

### 3.6 Real-Time Order Tracking
- **FR-TRACK-01 (Status Timeline):** Visual stepper: `Order Placed` ➔ `Kitchen Baking` ➔ `Rider Dispatched` ➔ `Delivered / Ready for Pickup`.
- **FR-TRACK-02 (Direct Contact):** Direct in-app call or WhatsApp button routing directly to AY Pizza dispatch hotline (`0813 073 1895`).
- **FR-TRACK-03 (Push Milestones):** Automated push notifications triggered at every state change.

---

## 4. Restaurant Operations & Kitchen Display System (KDS)

To prevent operational confusion behind the counter, a lightweight, responsive Restaurant Tablet Interface / KDS will accompany the backend:

- **FR-OPS-01 (Audible Order Alert):** Loud chime rings continuously on the kitchen tablet when a new paid order arrives until accepted.
- **FR-OPS-02 (Order Lifecycle Controls):** Single-touch buttons to mark order: `Accept & Bake`, `Ready for Pickup / Dispatch`, `Completed`.
- **FR-OPS-03 (Menu Availability Toggle):** Kitchen manager can toggle any pizza flavor or topping to "Out of Stock" in 2 taps, instantly updating all customer apps.
- **FR-OPS-04 (Thermal Kitchen Printer Support):** Optional Bluetooth / ESC-POS printer integration for automated slip printing directly to the pizza oven station.

---

## 5. Non-Functional Requirements (NFR)

| Category | Requirement Specification |
| :--- | :--- |
| **Performance** | Cold app launch < 1.8s; catalog render < 200ms; transition FPS locked at 60fps. |
| **Network Resilience** | Graceful degradation on poor 2G/3G campus connections; automatic retry on offline requests. |
| **Data Protection** | Encryption in transit (TLS 1.3) and at rest (AES-256 for user records); strict NDPR (Nigeria Data Protection Regulation) compliance. |
| **Scalability** | Capable of handling peak campus surges of 2,000 concurrent active sessions and 100 orders/minute during UNILAG events or exams. |
| **Maintainability** | Clean TypeScript architecture throughout; 100% type-safe API client generated from backend schemas. |
