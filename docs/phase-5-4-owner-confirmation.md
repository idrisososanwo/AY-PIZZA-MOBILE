# AY PIZZA & ICE CREAM — PHASE 5.4 OWNER CONFIRMATION & DECISION DOCUMENT
**Document Version:** 1.0.0  
**Target Stakeholder:** AY Pizza & Ice Cream Business Owner / Management  
**Application ID:** `ng.aypizza.app`  
**Date:** November 2026  
**Status:** Awaiting Owner Review & Formal Sign-Off  

---

## Executive Summary

Phase 5.4 of the AY Pizza & Ice Cream mobile application has engineered a robust, database-driven address management and delivery pricing infrastructure. 

During our initial engineering audit, we discovered that historical rates in the legacy web platform (`aypizza.ng`) hardcoded 19 specific landmarks across Lagos Mainland with fees ranging from **₦500** (Inside School / UNILAG Campus) to **₦4,000** (Oworo, Gbagada, Ebute Metta). 

To ensure the business never suffers unexpected delivery losses, inaccurate pricing, or customer friction, **all 19 delivery landmark tariffs are implemented as provisional, configurable database records in Supabase (`public.delivery_landmarks` and `public.delivery_config`)**. They can be adjusted or toggled in real time without requiring a mobile app store update.

Before deploying these rates and operational policies to production customers, the restaurant owner must formally review and confirm the 12 business policy decisions detailed below.

---

## 1. Landmark Delivery Tariffs (19 Audited Zones)

The table below reflects the provisional fees extracted from the legacy web portal audit, categorized into geographic delivery zones anchored from the UNILAG kitchen:

| # | Delivery Landmark / Area | Zone Category | Provisional Fee | Proposed Est. Time | Owner Action Required |
|---|--------------------------|---------------|-----------------|--------------------|-----------------------|
| 1 | **Inside School (UNILAG Campus)** | Zone 1: Campus | **₦500** | 15 – 25 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 2 | **Abule Oja** | Zone 2: Inner Environs | **₦1,000** | 20 – 35 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 3 | **Akoka** | Zone 2: Inner Environs | **₦1,000** | 20 – 35 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 4 | **Onike** | Zone 2: Inner Environs | **₦1,000** | 20 – 35 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 5 | **Iwaya** | Zone 2: Inner Environs | **₦1,000** | 25 – 40 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 6 | **Abule Ijesha** | Zone 2: Inner Environs | **₦1,200** | 25 – 40 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 7 | **Bariga** | Zone 2: Inner Environs | **₦1,500** | 25 – 45 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 8 | **Makoko** | Zone 3: Mid Environs | **₦2,000** | 30 – 50 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 9 | **Alagomeji** | Zone 3: Mid Environs | **₦2,000** | 30 – 50 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 10 | **Bajuliaye** | Zone 3: Mid Environs | **₦2,000** | 30 – 50 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 11 | **Shomolu** | Zone 3: Mid Environs | **₦2,000** | 30 – 50 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 12 | **Yaba (Commercial / Tech)** | Zone 3: Mid Environs | **₦2,000** | 30 – 50 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 13 | **Palmgroove** | Zone 3: Mid Environs | **₦2,500** | 35 – 55 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 14 | **LUTH / Idi-Araba** | Zone 4: Outer Mainland | **₦3,000** | 40 – 60 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 15 | **Onipanu** | Zone 4: Outer Mainland | **₦3,000** | 40 – 60 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 16 | **Surulere** | Zone 4: Outer Mainland | **₦3,500** | 45 – 65 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 17 | **Gbagada** | Zone 4: Outer Mainland | **₦4,000** | 45 – 70 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 18 | **Ebute Metta** | Zone 4: Outer Mainland | **₦4,000** | 45 – 70 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |
| 19 | **Oworo (Owshodi-Oworonshoki)** | Zone 4: Outer Mainland | **₦4,000** | 50 – 75 mins | [ ] Approve &nbsp; [ ] Modify to: ₦_______ |

> **Decision Point 1:** Are the 19 landmark fees above acceptable as the baseline production tariffs, or should any landmark be repriced or removed?

---

## 2. Free Delivery Threshold Policy

- **Current Default:** Disabled (`NULL` in `delivery_config`). Every delivery incurs the landmark fee.
- **Option A:** Maintain no free delivery (standard for standalone pizzeria operations in Lagos).
- **Option B:** Introduce a free delivery threshold for large orders (e.g., Free delivery on orders exceeding **₦25,000** on campus, or **₦35,000** anywhere on Mainland).
- **Option C:** Restrict free delivery to UNILAG campus only for orders above **₦15,000**.

> **Decision Point 2:** Does AY Pizza want to offer free delivery above a certain order cart subtotal? If yes, what is the qualifying amount?

---

## 3. Minimum Order Amount for Delivery

- **Current Default:** No minimum order amount (a customer can order a single ice cream or small pizza).
- **Consideration:** Delivering an ice cream cone worth ₦1,500 to Surulere with a ₦3,500 delivery fee may lead to driver dispatch inefficiency or customer disputes.
- **Proposed Alternatives:**
  - Campus: No minimum order requirement.
  - Off-Campus (Zones 2, 3, 4): Minimum cart subtotal of **₦4,000** or 1 pizza.

> **Decision Point 3:** Should there be a minimum food order value before delivery is allowed outside UNILAG campus?

---

## 4. Operating Days and Hours for Delivery

- **Current Default:** Operational toggles are currently available (`is_delivery_active`, `is_pickup_active`).
- **Kitchen Hours:** UNILAG kitchen operational schedule:
  - Weekdays (Mon – Fri): 9:00 AM – 9:30 PM
  - Weekends (Sat – Sun): 10:00 AM – 9:00 PM
- **Late-Night Delivery Restrictions:** UNILAG security gates enforce strict entry and exit curfews (typically 10:00 PM or 11:00 PM for non-residents). Off-campus bike riders cannot easily enter campus after hours.

> **Decision Point 4:** What are the exact hours when customers can place delivery orders? Should delivery stop 30 minutes before kitchen closing?

---

## 5. Maximum Delivery Radius Limits

- **Current Default:** **15.0 km** maximum radius from the UNILAG kitchen.
- **Geographic Coverage:** A 15 km radius comfortably covers UNILAG, Yaba, Ebute Metta, Surulere, Bariga, Gbagada, Shomolu, and Anthony. It deliberately excludes Lagos Island, Victoria Island, Lekki, Ikeja, and Agege to maintain food quality and prevent pizza/ice cream temperature degradation.
- **Out-of-Bounds Behavior:** Customers beyond 15 km are automatically shown an explanatory message advising them to choose **In-Store Pickup** at King Jaja Hall.

> **Decision Point 5:** Is the 15.0 km boundary acceptable, or should the radius be widened or tightened (e.g., 10.0 km)?

---

## 6. Peak-Hour and Surge Pricing Policies

- **Current Default:** Multiplier is set to **1.0x** (surge pricing disabled).
- **Capabilities Built:** The engine supports an administrative `surge_multiplier` (e.g., 1.25x or 1.5x) for high-demand periods or adverse delivery conditions.
- **Policy Question:** Should AY Pizza apply surge delivery pricing during:
  - Friday / Saturday evening campus rush hours (6:00 PM – 9:00 PM)?
  - Severe traffic gridlock along the University Road / Akoka axis?
  - Or should pricing remain strictly flat and predictable for student trust?

> **Decision Point 6:** Does the owner permit surge pricing during peak hours, or must rates stay strictly flat?

---

## 7. Delivery Partner & Driver Dispatch Integration

- **Current Dispatch Model:** In-house restaurant delivery staff / campus dispatchers.
- **Planned Dispatch Pipeline:**
  - Internal dispatchers assigned directly via the Kitchen Display System (KDS) and Staff Portal.
  - Third-party API integration (e.g., Chowdeck Logistics, Fez Delivery, Gokada, Max.ng) if volume exceeds internal dispatch capacity.

> **Decision Point 7:** Will all deliveries initially be fulfilled by AY Pizza's own fleet of dispatch riders, or will a 3rd-party logistics provider be used for off-campus orders?

---

## 8. Cash on Delivery (COD) vs Prepayment Policy

- **Current Default:** Digital Prepayment only (Paystack card, bank transfer, USSD). Order status moves to `PAID` before kitchen ticket generation.
- **Fraud & Security Risk:** Accepting Cash on Delivery across student hostels or off-campus mainland streets introduces significant rider safety risks, counterfeit note risks, and unpaid food abandonment.

> **Decision Point 8:** Confirm that all delivery orders require 100% digital prepayment before food preparation begins.

---

## 9. Store Location Coordinates Confirmation

- **Current Kitchen Anchor:** `6.5186° N, 3.3983° E` (directly opposite King Jaja Hall, UNILAG Main Campus, Akoka, Lagos).
- **Importance:** All distance calculations, geodesic estimations, and radius boundary checks are anchored from this geographic point.

> **Decision Point 9:** Confirm that `6.5186° N, 3.3983° E` accurately identifies the pickup and dispatch location for AY Pizza.

---

## 10. Campus-Specific Delivery Rules (Hall Delivery vs Gate Handover)

UNILAG halls of residence have distinct access restrictions:
- **Female Halls (e.g., Moremi Hall, Madam Tinubu Hall, Amina Hall, Honours Hall):** Male dispatch couriers are strictly barred from entering residential floors or stairwells. Orders must be handed over to the student at the hostel porter's lodge or security gate.
- **Male Halls (e.g., King Jaja Hall, Mariere Hall, Eni Njoku Hall):** Couriers may hand over at the common room, porter's lodge, or room entrance depending on hall security regulations.
- **Departments & Faculties (e.g., Engineering, Law, Social Sciences, CITS):** Delivery to faculty front desks or lecture theater gates.

> **Decision Point 10:** Should customer delivery instructions explicitly mandate porter's lodge handover for female hostels, or can riders coordinate directly by phone upon arrival?

---

## 11. Packaging & Insulated Bag Fee Policy

- **Current Default:** ₦0 packaging fee (included in food retail prices).
- **Ice Cream Quality Preservation:** Soft-serve ice cream, pints, and sundaes require thermal insulated sleeves or ice packs when delivered in Lagos heat, particularly for 30+ minute transit to Surulere or Gbagada.
- **Policy Question:** Should a nominal thermal packaging fee (e.g., ₦200 – ₦300) be applied for off-campus ice cream deliveries, or absorbed into product prices?

> **Decision Point 11:** Is packaging included free of charge, or should thermal packaging fees apply for off-campus ice cream orders?

---

## 12. Weather-Related Delivery Suspension Policy

Lagos experiences intense tropical downpours during the rainy season, causing severe localized flooding along Akoka, Bariga, and Iwaya roads.
- **App Capability:** An instant operational switch (`is_delivery_active = false`) in Supabase and the Staff Dashboard allows management to immediately pause delivery while keeping **In-Store Pickup** active.
- **Policy Question:** Should weather suspensions be triggered automatically by rainfall radar or managed manually by the shift supervisor on duty?

> **Decision Point 12:** Confirm that weather-related delivery pauses will be managed via the supervisor dashboard toggle.

---

## Sign-Off Block

Please indicate your approval and decisions below:

- **Reviewed by:** _______________________________________
- **Designation:** _______________________________________
- **Signature:** _________________________________________
- **Date:** _____________________________________________

