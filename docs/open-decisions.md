# Open Technical & Strategic Decisions

**Project:** AY Pizza Mobile Application (iOS & Android)  
**Document:** Architectural Trade-offs & Open Decisions (Phase 0 Discovery)  
**Date:** October 21, 2026  

---

## 1. Overview

Before commencing Phase 1 implementation, key architectural and operational choices must be aligned with the restaurant owner and engineering leadership. This document presents each decision point, evaluating realistic alternatives, pros and cons, cost implications, and providing a definitive recommendation.

---

## 2. Decision Matrix

### Decision 1: Backend Technology & Data Platform

| Option | Architecture | Pros | Cons | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **Option A: Supabase + PostgreSQL + Edge Functions** | Managed PostgreSQL, Row-Level Security, built-in Auth, instant Realtime WebSocket engine for Kitchen Display, and TypeScript Edge Functions. | • Zero DevOps overhead.<br>• Instant real-time order updates to kitchen tablet and customer phones without building custom WebSocket servers.<br>• Generous free/low-cost tier ($25/mo).<br>• Fully PostgreSQL-compatible. | • Vendor coupling to Supabase ecosystem (mitigated by standard PostgreSQL export). | **STRONGLY RECOMMENDED** (Highest velocity, superior reliability, built-in real-time features ideal for food delivery). |
| **Option B: Custom Node.js / NestJS + PostgreSQL (e.g. on Railway/AWS)** | Standalone TypeScript server with Prisma/Drizzle ORM and PostgreSQL. | • Complete custom architectural control.<br>• Portability across any cloud provider. | • Requires manual setup of WebSocket gateway for live order updates.<br>• Higher DevOps and maintenance burden for solo/small teams. | **Viable Alternative** if custom on-premise infrastructure is required. |
| **Option C: Extending Existing Hostinger PHP/MySQL Scripts** | Modifying legacy procedural PHP scripts on `aypizza.ng`. | • Reuses existing hosting account. | • Severe security and scalability risks.<br>• No real-time push/WebSocket capability.<br>• High risk of system crashes during traffic surges. | **REJECTED.** |

---

### Decision 2: Restaurant Order Reception & Kitchen Display Strategy

How should counter staff at the King Jaja location receive and manage incoming mobile orders?

| Option | Implementation | Pros | Cons | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **Option A: Responsive Web-Based Kitchen Display System (KDS)** | Dedicated, PIN-protected web app optimized for tablet (iPad or Android tablet) placed on counter. | • Runs on any tablet or computer without App Store review.<br>• Large touch targets for kitchen staff.<br>• Audio chime rings on new order.<br>• Zero app store install friction. | • Tablet must stay plugged in and browser screen active. | **RECOMMENDED (Primary)** |
| **Option B: Dedicated Staff Mobile App (Expo)** | Secondary mobile application built with Expo for store managers and riders. | • Native push notifications and background ringtones.<br>• Allows manager to track orders from home. | • Requires separate app store deployments or internal APK distribution. | **Recommended for Phase 2** as manager companion app. |
| **Option C: WhatsApp Business Automated Print / Dispatch Alerts** | Incoming orders trigger an automated WhatsApp summary to the store hotline (`0813 073 1895`). | • Zero new screen needed behind counter.<br>• Uses tool staff already knows. | • Difficult to track multi-stage status (Preparing vs Dispatched).<br>• Potential spam rate limits by Meta. | **Recommended as Fallback / Backup Alert Channel.** |

---

### Decision 3: Chowdeck Operational Alignment

| Option | Strategy | Immediate Actions | Impact |
| :--- | :--- | :--- | :--- |
| **Strategy A: Autonomous D2C Channel (Recommended)** | Launch mobile app as AY Pizza's proprietary VIP club channel offering 5% loyalty cashback, student deals, and zero-commission orders. Staff continues using Chowdeck tablet for marketplace orders. | No dependency on Chowdeck developer API access. Immediate path to production. | Maximizes restaurant profit margins, builds proprietary customer database, zero integration risk. |
| **Strategy B: Relay Logistics Integration** | Use Chowdeck's *Relay API* to dispatch riders solely for distant mainland deliveries (outside campus). | Request Relay API credentials from Chowdeck merchant account manager. | Solves delivery rider sourcing for off-campus orders, but requires wallet balance on Chowdeck. |
| **Strategy C: Bi-Directional POS Synchronization** | Integrate both Chowdeck API and Mobile App into a single unified inventory and order queue. | Requires full developer access, merchant webhooks, and ongoing third-party maintenance. | High complexity; recommended only for future enterprise scaling. |

---

### Decision 4: Phone Authentication & OTP Verification

| Option | Provider | Delivery Performance in Nigeria | Cost | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **Option A: Termii (Nigeria-First)** | Termii SMS & WhatsApp OTP API | Highest delivery rates across MTN, Airtel, Glo, and 9mobile; fallback to WhatsApp OTP if SMS is delayed by DND. | ~₦3.50 per SMS; ~₦4.00 per WhatsApp OTP | **STRONGLY RECOMMENDED** for Nigerian user base. |
| **Option B: Firebase Phone Auth** | Google Firebase Authentication | Standard international routing; occasionally blocked or delayed by Nigerian telco Do-Not-Disturb (DND) filters. | Free tier up to 10k/month, then pay-as-you-go | **Viable Fallback**, but Termii has higher localized delivery success. |
| **Option C: Email + Password Only (No SMS)** | Traditional credentials with optional social login (Apple/Google). | 100% free; zero SMS delivery failure. | Slower registration for students; higher password forgotten rate. | **Include alongside Phone Login** as an alternate choice. |

---

### Decision 5: Delivery Sourcing Model

| Delivery Zone | Proposed Delivery Execution | Rationale |
| :--- | :--- | :--- |
| **UNILAG On-Campus (Hostels, Faculties, Senate House)** | **AY Pizza In-House Student / Campus Runners (Flat ₦500)** | Fast, pedestrian or bicycle-friendly; outside riders often get delayed at security gates. High student satisfaction and 15–20 minute delivery times. |
| **Immediate Surrounding Areas (Akoka, Abule Oja, Onike, Bariga)** | **AY Pizza Dedicated Bike Rider** | High volume, close proximity, manageable delivery radius. |
| **Distant Lagos Mainland (Surulere, Gbagada, Ebute Metta, LUTH)** | **In-House Rider OR Chowdeck Relay / On-demand Courier** | Higher delivery fee (₦3,000–₦4,000) covers outsourced dispatch cost. |

---

## 3. Questions Requiring Restaurant Owner Input

1. **Chowdeck Relationship:** Does AY Pizza have an enterprise account manager at Chowdeck who can provision Developer API keys, or is the current relationship standard merchant-only?
2. **Current Delivery Fleet:** How are website and WhatsApp deliveries currently fulfilled? Does AY Pizza employ dedicated motorcycle riders or campus dispatch runners?
3. **Counter Hardware:** Does the counter opposite King Jaja currently have an iPad, Android tablet, or POS desktop terminal with continuous internet access, or will a dedicated tablet need to be budgeted?
4. **Paystack Merchant Sub-account:** Will the mobile application use the exact same Paystack account credentials currently powering `aypizza.ng`, or a separate dedicated mobile sub-account for segmented reporting?
