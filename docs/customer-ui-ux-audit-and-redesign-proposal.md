# AY PIZZA & ICE CREAM — CUSTOMER APP COMPLETE UI/UX AUDIT & UNIFIED DESIGN SYSTEM PROPOSAL

**Document Version:** 1.0.0  
**Audit Date:** 2026-11-11  
**Project:** AY Pizza & Ice Cream Mobile Application (React Native / Expo)  
**Target Benchmark Device:** Xiaomi Redmi 13C (~360dp viewport width, 720×1600 px, ~268 ppi, Android 13/14)  
**Audit Type:** Strictly READ-ONLY Architectural & Visual-Experience Audit  
**Target Output File:** `docs/customer-ui-ux-audit-and-redesign-proposal.md`  

---

## 1. EXECUTIVE SUMMARY & AUDIT SCOPE

### 1.1 Executive Summary
AY Pizza & Ice Cream has built an exceptionally robust, server-authoritative mobile commerce application for its UNILAG campus store opposite King Jaja Hall. The engineering backbone—including Paystack hosted checkout with cryptographic verification, idempotent database settlement, two-tiered order cancellation eligibility, hardware-backed guest receipt persistence (`SecureStore`), and real-time order tracking—is production-grade.

However, the current visual presentation and interface layer reflect incremental development across multiple release phases. The user experience currently suffers from:
1. **Color Token Drift & Fragmentation:** Divergence between legacy `#C9232B` / `#F4B323` and approved brand `#B91C1C` / `#3E2723` / `#FFF7E6` / `#F59E0B`.
2. **Text Density & Cognitive Overload:** Explanatory campus prose and multi-line disclaimer boxes push critical interactive actions below the fold on standard 360dp mobile screens.
3. **Card-Within-Card Nesting:** Cart and Checkout screens stack up to six bordered white containers, creating visual clutter and diluting visual hierarchy.
4. **Sub-Optimal Touch Targets & Legibility:** Sub-text and badges sized down to 8–9dp fail accessibility criteria on budget Android screens.
5. **Modal Stacking & Navigation Overload:** Over 12 distinct full-screen and slide-up modals create complex modal-on-modal stacking on Android.

This document delivers a thorough, screen-by-screen audit of all 15 customer interaction surfaces, establishes an authoritative shared Design System adhering to the approved brand palette, references industry-leading restaurant design benchmarks (Chowdeck, Shake Shack, Domino's, Sweetgreen), and provides a risk-free, phased implementation sequence.

---

## 2. COMPLETE APPLICATION SCREEN & COMPONENT INVENTORY

Every existing customer screen, route, modal, sheet, and interaction state was inspected in source code (`App.tsx` and `src/components/*`):

| # | Screen / Surface | File Reference | Primary Route / Trigger | Modal / Screen Type | Key Capabilities & Functional State |
|---|---|---|---|---|---|
| **1** | **Native & In-App Launch Experience** | [`src/components/BrandedLaunchScreen.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/BrandedLaunchScreen.tsx) | App startup | Full-screen animated overlay | Native splash hold (`expo-splash-screen`), 9 realistic food cutouts, animated gold aura rings, central monogram logo, reduced-motion accessibility fallback. |
| **2** | **Authentication & Account Recovery** | [`src/components/AuthModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/AuthModal.tsx) | Top Header, Drawer, Account, Checkout | Slide-up Modal (`KeyboardAvoidingView`) | Modes: `signin`, `signup`, `forgot`, `verification`. Supabase email/password, full name, phone validation, password toggle, resend verification email. |
| **3** | **Home Screen & Discovery** | [`src/components/HomeScreen.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/HomeScreen.tsx) | Bottom Tab: `home` | Root Scrollable Tab View | Delivery vs Pickup toggle, active landmark row, live kitchen open indicator, search button, active order live strip, hero promo carousel (3 slides), category chips, Bestsellers shelf, Dessert shelf, UNILAG campus trust card. |
| **4** | **Menu Catalog & Search** | [`App.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/App.tsx), [`src/components/CategoryBar.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/CategoryBar.tsx) | Bottom Tab: `menu` | Tab View + Sticky Category Bar | Real-time text search, clear search button (✕), category pill bar, vertical product cards list, loading spinner, empty search reset state. |
| **5** | **Product Card** | [`src/components/ProductCard.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/ProductCard.tsx) | Home & Menu lists | Reusable Card Component | 78×78 image thumbnail, culinary badges (Spicy 🌶️, Veggie 🌱, Real Dairy 🍨), stock badge, title, 2-line description, base price, dynamic CTA ("+ Add" vs "Customize ⚙️"). |
| **6** | **Product Detail Preview** | [`src/components/ProductDetailModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/ProductDetailModal.tsx) | Card press on Home/Menu | Bottom Sheet Modal | Full-bleed hero food image, category badge, title, base price, description, available sizes chips preview, King Jaja kitchen note, CTA to open customizer. |
| **7** | **Interactive Product Customizer** | [`src/components/CustomizerModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/CustomizerModal.tsx) | "Customize" button on Card / Detail | Slide-up Modal (`KeyboardAvoidingView`) | Radio size cards with price delta, Half & Half pizza builder toggle (+₦1,000 split surcharge, secondary flavor picker), shake/ice cream flavor multi-select, extra toppings checklist, special instructions textarea, quantity stepper, live sticky price calculation footer. |
| **8** | **Shopping Cart & Pre-Checkout** | [`src/components/CartView.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/CartView.tsx) | Header Cart Icon, Floating Cart Bar | Dedicated Root View | Empty cart state with campus suggestions, fulfillment selector (Delivery vs Pickup), delivery landmark picker trigger, saved address shortcut, room address & notes inputs, itemized rows with thumbnails, Half & Half breakdown, toppings, quantity steppers, item edit/remove, price change banner, cost estimation summary, checkout readiness checklist card. |
| **9** | **Floating Cart Bar** | [`App.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/App.tsx) | Docked above Bottom Bar | Floating Persistent Bar | Item count badge, count label ("X Items"), estimated total in Naira, "View Cart →" action. Visible when `itemCount > 0` and cart is closed. |
| **10** | **Checkout Workflow** | [`src/components/CheckoutModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/CheckoutModal.tsx) | "Proceed to Checkout" from Cart | Multi-stage Slide-up Modal | 3-stage flow: (1) Fulfillment & Customer Details, (2) Order Review & Price Reconciliation, (3) Payment Execution. GPS location assist, contact pre-fill, authoritative server price discrepancy modal, Paystack initialization. |
| **11** | **Paystack Hosted Payment** | [`src/components/PaystackPaymentModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/PaystackPaymentModal.tsx) | Checkout stage 3 | Slide-up Action Modal | External browser launch (`https://checkout.paystack.com/...`), real-time background polling (every 4s for up to 2m), manual "Re-check Payment Status" trigger, staging simulator action (safe-guarded), ambiguous outcome notice. |
| **12** | **Digital Order Receipt** | [`src/components/OrderReceiptModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/OrderReceiptModal.tsx) | Post-payment success, Order history | Slide-up Modal | Brand monogram, verified payment badge, order number, timestamp, customer name, fulfillment destination, itemized product list with customizations, financial summary, native Share dialog (`buildSanitizedReceiptText`), "Track Live 📡", "Cancel Order 🚫" (if `CONFIRMED`). |
| **13** | **Order Tracking Experience** | [`src/components/OrderTrackingModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/OrderTrackingModal.tsx) | Receipt, Home active strip, Orders tab | Full-screen Modal | Dual-track progress: Delivery (6 milestones) vs Pickup (5 milestones). Status hero card, pulsing live indicator, authoritative event timestamps, order items summary, delivery address, courier info, Call Store / WhatsApp / Share actions, push notification prompt, customer cancellation button. |
| **14** | **Customer Order Cancellation** | [`src/components/CancelOrderConfirmationModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/CancelOrderConfirmationModal.tsx) | Receipt / Tracking Cancel button | Centered / Bottom Sheet Modal | Order # and total, irreversible cancellation warning, reason pills ('Ordered by mistake', 'Delivery time too long', 'Changed my mind', 'Selected wrong address', 'Other'), custom text input, server cancellation RPC execution. |
| **15** | **Orders History & Activity** | [`src/components/OrdersScreen.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/OrdersScreen.tsx) | Bottom Tab: `orders` | Tab Screen with Segmented Tabs | Filter tabs: `Active`, `Completed`, `Cancelled`. Merges hardware-backed `SecureStore` guest receipts with authenticated profile orders. Order card with items breakdown, status badge, 1-tap "Track Live", "View Receipt", "Reorder 🔄", and "Cancel". Pull-to-refresh. |
| **16** | **Customer Account & Profile** | [`src/components/AccountScreen.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/AccountScreen.tsx) | Bottom Tab: `account` | Tab Screen | Authenticated profile header with initials avatar, role badge, member since date; guest welcome card with Sign In / Register; quick links to Orders, Edit Profile, Saved Addresses, Push Notification toggle (with native OS settings link), Support, Terms, Privacy, Deletion request, Staff KDS shortcut, Sign Out. |
| **17** | **Profile Editor** | [`src/components/EditProfileModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/EditProfileModal.tsx) | Account → Personal Info | Slide-up Modal | Full name input, phone number input (with 10-digit validation), updates Supabase `profiles` table. |
| **18** | **Saved Delivery Addresses** | [`src/components/SavedAddressesModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/SavedAddressesModal.tsx) | Account, Drawer, Cart, Checkout | Full-featured Slide-up Modal | Address list with default badge, address type chips (Hostel, Faculty, Staff Quarters, Off-Campus, Office), searchable landmark selector, estate/hostel, room/plot, street address, contact phone, delivery notes, GPS auto-assist, set default switch. Syncs to Supabase `customer_addresses` for users; `AsyncStorage` for guests. |
| **19** | **Landmark / Tariff Picker** | [`src/components/LandmarkPickerModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/LandmarkPickerModal.tsx) | Cart, Checkout, Saved Addresses | Slide-up Modal | Search input, zone category chips (All 19, UNILAG Campus Hostels/Faculties, Inner Environs, Mid Environs, Outer Environs), GPS auto-detect location button, delivery fee badges, selection callback. |
| **20** | **Navigation Drawer** | [`src/components/NavigationDrawer.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/NavigationDrawer.tsx) | Header Hamburger icon (☰) | Left Slide-in Drawer Panel | Brand identity banner, UNILAG campus pill, profile/guest greeting card, navigation links (Home, Menu, Orders with badge count, Promotions, Saved Addresses, Account, Support, Staff KDS), Sign Out button, King Jaja location footer. |
| **21** | **Customer Support & FAQs** | [`src/components/SupportModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/SupportModal.tsx) | Drawer, Account | Slide-up Modal | Quick communication action buttons (Call Phone Hotline, WhatsApp Support Chat, Email Support—each guarded with owner verification status checks), expandable accordion FAQs. |
| **22** | **Promotions & Offers** | [`src/components/PromotionsModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/PromotionsModal.tsx) | Drawer, Home promo clicks | Slide-up Modal | Authoritative campus perks (Flat ₦500 delivery, Half & Half combo, Free counter pickup), filter tabs (All, Perks, Codes), "Order Now" action buttons. |
| **23** | **Terms & Privacy Policies** | [`src/components/TermsPrivacyModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/TermsPrivacyModal.tsx) | Account Screen links | Slide-up Modal | Policy view with sections for campus food preparation, pricing, fulfillment, data privacy. |
| **24** | **Account Deletion** | [`src/components/AccountDeletionModal.tsx`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/components/AccountDeletionModal.tsx) | Account Screen link | Slide-up Modal | Reason selector, warning notice, signs out user and records deletion request. |

---

## 3. CURRENT UI/UX ASSESSMENT ACROSS 12 EVALUATION DIMENSIONS

### 3.1 Layout & Visual Hierarchy
- **Strengths:** Clear separation between primary views via the bottom tab bar and header. The product cards present essential details (image, name, price, action).
- **Weaknesses:**
  - On the Home screen, the fulfillment card, greeting, active order strip, hero carousel, category pills, bestsellers, dessert shelf, and campus trust card create a long page with competing visual focal points.
  - The hero banner is dense with two badges, a title, subtitle, CTA button, and 3 bullet pills inside a 136dp container.
  - In `CartView`, information is broken into too many separate bordered cards (1. Fulfillment, 2. Items, 3. Cost, 4. Campus note, 5. Readiness card).

### 3.2 Typography & Readability
- **Strengths:** High contrast charcoal `#1F1F1F` / `#27211F` ensures text is legible against light backgrounds.
- **Weaknesses:**
  - Multiple components define local inline font sizes that bypass `Typography` tokens in `src/constants/theme.ts`.
  - Several tags and subtitles use font sizes of 8px, 9px, and 10px (`culinaryBadgeText: 8px`, `heroBadgeText: 8px`, `unilagPillText: 9px`). On standard Android screens, these fall below minimum legible standards and strain readability.
  - Line heights on item descriptions in `ProductCard` are constrained to 16px with `numberOfLines={2}`, often truncating appetizing descriptors.

### 3.3 Colour Usage & Contrast
- **Strengths:** Warm cream `#FFF7E6` creates an inviting, culinary feel far superior to sterile cold grey `#F3F4F6`.
- **Weaknesses:**
  - **Color Palette Drift:** The codebase currently runs two competing red and gold definitions:
    - `BrandPalette` (Phase 5.2.3): Red `#B91C1C`, Brown `#3E2723`, Cream `#FFF7E6`, Orange `#F59E0B`, Charcoal `#1F1F1F`.
    - Legacy `Colors`: Red `#C9232B`, Yellow `#F4B323`, Cream `#FFF8EC`, Charcoal `#27211F`.
  - In `ProductCard.tsx`, the "+ Add" button is colored golden yellow with charcoal text, while the "Customize" button is red with white text. This creates an unintentional priority conflict where adding an un-customized item appears more prominent than customizing.

### 3.4 Product Photography & Image Presentation
- **Strengths:** Real food photography assets (`FoodImages.heroBanner`, `FoodImages.bbqChicken`, `FoodImages.milkshake`, etc.) are high-resolution and appetizing.
- **Weaknesses:**
  - In `ProductCard.tsx`, images are constrained to a small 78×78 square thumbnail on the left, suppressing food appeal.
  - In `HomeScreen.tsx` horizontal shelves, images use a 110dp height with a cover crop that occasionally clips pizza crust edges.
  - No shimmer or skeleton placeholder exists while images load from disk or network, resulting in momentary white squares.

### 3.5 Spacing & Alignment
- **Strengths:** Consistent horizontal padding of 14–16dp across screens prevents content from sticking to device screen edges.
- **Weaknesses:**
  - Vertical stacking margins are inconsistent: some cards use 8dp, others 10dp, 12dp, 14dp, 16dp, or 18dp.
  - The floating cart bar hovers directly over the bottom tab bar with 12dp margin, occasionally obscuring the last item in long lists if bottom scroll padding is insufficient.

### 3.6 Buttons, Cards, Inputs & Navigation
- **Strengths:** Pills (`Radius.pill: 9999`) and rounded cards (`Radius.lg: 16`) create a soft, modern aesthetic.
- **Weaknesses:**
  - Text input fields in `CartView` and `SavedAddressesModal` use basic rectangular borders with minimal internal padding (10–12dp), lacking a premium active focus state.
  - Navigation between Menu, Cart, and Checkout relies on state toggles (`isCartOpen`) within `App.tsx` rather than deep-linkable route stacks.

### 3.7 Consistency Across Screens
- **Strengths:** All modals share a consistent dark backdrop (`rgba(20, 10, 5, 0.52)` or `rgba(39, 33, 31, 0.65)`) with rounded top sheets.
- **Weaknesses:**
  - Header designs vary: `HomeScreen` has an inline greeting, `Menu` has a search box, `Orders` has segmented tabs, and `Account` has a profile card.
  - Close buttons alternate between circle icons (`width: 36, height: 36`), plain text `✕`, and header buttons.

### 3.8 Responsiveness on Xiaomi Redmi 13C Benchmark (~360dp Wide)
- **Strengths:** Flexible flexbox layouts prevent severe horizontal clipping.
- **Weaknesses:**
  - On 360dp screens, horizontal space is constrained: 360dp minus 32dp outer padding leaves only 328dp.
  - In `ProductCard.tsx`, subtracting 78dp image and 10dp margin leaves 240dp for name, stock badge, description, price, and CTA. Long product names ("BBQ Chicken Suya Supreme") compress the stock badge or wrap awkwardly.
  - In `HomeScreen.tsx`, the fulfillment row containing "DELIVERY DESTINATION", the landmark name, fee subtext, and the "Change ▾" pill becomes vertically cramped.

### 3.9 Accessibility & Touch-Target Sizes
- **Strengths:** High contrast text meets WCAG 2.1 AA against white and warm cream backgrounds.
- **Weaknesses:**
  - Carousel pagination dots in `HomeScreen` have a touch height of only 4dp with a 4dp hit slop (total 12dp), far below the recommended 44×44dp touch target.
  - Stepper minus/plus buttons in `CartView` (`styles.stepperBtn`) have minimal padding, risking accidental taps.
  - Several interactive icons lack explicit `accessibilityLabel` attributes.

### 3.10 Loading, Empty, Error & Success States
- **Strengths:** Empty cart state includes high-value campus recommendations ("Popular on Campus"). Stale cart items and price discrepancies display defensive warning banners.
- **Weaknesses:**
  - Loading states rely entirely on a standard spinning `ActivityIndicator` centered on screen.
  - Search empty state shows an emoji and text button, but lacks quick-filter suggestions (e.g. "Try: Chicken, Pepperoni, Shake").
  - Payment failure and network timeouts rely on native `Alert.alert()` dialogues rather than integrated, contextual feedback cards.

### 3.11 Animation & Interaction Opportunities
- **Strengths:** `BrandedLaunchScreen.tsx` provides an animated multi-layer entrance with floating ambient food items. `NavigationDrawer.tsx` uses smooth slide-in and fade transitions.
- **Weaknesses:**
  - Adding an item to cart triggers an abrupt pop-up toast and counter increment with zero micro-animation.
  - Toggling fulfillment tabs (Delivery / Pickup) switches instantly without fluid layout animation.
  - Quantity changes in cart lack spring or bounce feedback.

### 3.12 Perceived Quality & Brand Identity
- **Strengths:** The artisan positioning ("Stone-oven baked right on campus opposite King Jaja") is authentic, distinctive, and strongly resonates with the UNILAG student community.
- **Weaknesses:**
  - The visual style alternates between a playful fast-food aesthetic (bright yellow badges, emojis everywhere) and a premium artisan pizzeria (deep chocolate brown, warm cream, wine red).
  - Unifying this into a coherent **"Artisan Campus Pizzeria"** design language will elevate perceived quality to match top-tier food delivery apps like Chowdeck and Shake Shack.

---

## 4. DESIGN REFERENCE RESEARCH & BENCHMARK ANALYSIS

To ground the redesign in proven, high-converting food ordering patterns, we analyzed benchmark applications across five critical domains:

### 4.1 Benchmark 1: Chowdeck (Nigeria's Leading Food Ordering Experience)
- **Reference Flow:** [Mobbin - Food Delivery Patterns](https://mobbin.com/browse/ios/apps?category=food-and-drink)
- **Key Pattern Takeaways:**
  - **Docked Floating Action Bar:** Instead of forcing users to scroll back up or look at the header, Chowdeck docks a high-contrast floating pill showing items, subtotal, and arrow above the navigation bar. AY Pizza already implemented a prototype of this, but it requires visual alignment with the brand palette.
  - **Single-Line Address Anchor:** Rather than an expansive fulfillment card, Chowdeck uses a minimalist header pill ("Deliver to • King Jaja Hall ▾") that leaves maximum vertical screen space for food discovery.
  - **Card Visuals:** Large 1:1 or 4:3 photography with subtle radius and zero harsh borders.

### 4.2 Benchmark 2: Shake Shack (Premium Fast-Casual Mobile Experience)
- **Reference Flow:** [Mobbin - Shake Shack App Flows](https://mobbin.com)
- **Key Pattern Takeaways:**
  - **Appetizing Hero Presentation:** High-impact, full-width menu photography with warm cream backgrounds (`#FBF8F5`) and deep forest green or chocolate accents.
  - **Clean Product Customizer:** Sticky bottom CTA with live price recalculation, clear visual stepper counters, and grouped options with radio/checkbox cards that highlight with a 2dp brand border when selected.
  - **Typography Hierarchy:** Bold, geometric sans-serif headings with generous letter-spacing paired with crisp, high-legibility body copy.

### 4.3 Benchmark 3: Domino's & Pizza Pizza (Custom Pizza Builders & Live Trackers)
- **Reference Flow:** [Dribbble - Pizza Builder Concepts](https://dribbble.com/tags/pizza-app) | [Dribbble - Pizza Tracker Flows](https://dribbble.com/tags/pizza-delivery)
- **Key Pattern Takeaways:**
  - **Half-and-Half Split Visualization:** Visual representation of a pizza divided down the center showing primary vs secondary topping selections.
  - **Milestone Pizza Tracker:** Step-by-step progress cards featuring contextual illustrations (oven baking, courier dispatch) with real-time status updates and direct courier/store calling shortcuts.
  - **Quick Reorder Drawer:** 1-tap reorder of past favorites directly from the home feed.

### 4.4 Benchmark 4: Sweetgreen (Modular, Clean Food Discovery)
- **Reference Flow:** [Behance - Food Delivery App Case Studies](https://www.behance.net)
- **Key Pattern Takeaways:**
  - **Pill Category Navigation:** Smooth horizontal chip scroller with subtle cream background and high-contrast active indicator.
  - **Dietary & Flavor Badges:** Minimalist, icon-free or single-emoji micro-badges (Spicy, Veggie, Dairy) placed subtly over food imagery without obscuring ingredients.
  - **Decluttered Review:** Order checkout presented as a clean receipt summary with transparent line-item pricing and prominent total.

---

## 5. PRIORITISED PROBLEM LIST

| ID | Screen / Component | Existing Implementation | Specific Visual or Usability Weakness | User Impact | Priority |
|---|---|---|---|---|:---:|
| **P-01** | Global Colors (`colors.ts`) | Dual definitions: `#C9232B` / `#F4B323` vs `#B91C1C` / `#F59E0B` / `#3E2723` | Color inconsistency across buttons, badges, and headers. | Weakens brand identity; feels fragmented. | **Critical** |
| **P-02** | `HomeScreen.tsx` | Full-width fulfillment card + greeting + active order + hero carousel all above menu | Pushes the actual food menu 450dp+ down the screen on a 360dp phone; users must scroll just to see one pizza. | High drop-off; delays browsing and purchasing. | **Critical** |
| **P-03** | `ProductCard.tsx` | 78×78 square thumbnail on left; text & actions squeezed into 240dp on right | Food photography is too small to stimulate appetite; product names wrap awkwardly; button wraps. | Poor food appeal; cluttered layout on 360dp screens. | **High** |
| **P-04** | `CartView.tsx` | Stack of 5 separate bordered white cards on cream canvas | Extreme visual clutter; high cognitive load; primary checkout CTA pushed below screen fold. | Checkout friction; cart abandonment. | **High** |
| **P-05** | `CustomizerModal.tsx` | Long vertical scroll with small radio buttons; Half & Half picker is plain text dropdown | Complex pizza customization lacks visual clarity; split topping choice is uninspiring. | Students default to standard pizzas; misses upsell opportunity. | **High** |
| **P-06** | Micro-Typography | Font sizes 8px and 9px used on badges and pills (`culinaryBadgeText`, `heroBadgeText`) | Illegible on budget 720p Android displays (Xiaomi Redmi 13C ~268 ppi); fails WCAG guidelines. | Inaccessible for visually impaired students. | **High** |
| **P-07** | `CheckoutModal.tsx` | 3-stage form with repeated address & notes fields; stacked modals for landmarks | Redundant fields; modal-on-modal stacking on Android can cause back-button traps. | Checkout frustration; input fatigue. | **Medium** |
| **P-08** | Touch Target Sizes | Pagination dots (4dp height), category pill hit slops, quantity stepper minus/plus buttons | Tapping small targets causes mis-clicks or accidental parent card triggers. | Frustrating interaction; accidental navigation. | **Medium** |
| **P-09** | Loading States | Centered spinning `ActivityIndicator` on blank screen | Perceived performance feels sluggish on cellular networks (UNILAG WiFi / MTN / Airtel). | Impatient users assume app is hung. | **Medium** |
| **P-10** | `OrderTrackingModal.tsx` | Heavy vertical milestone list with text explanations for each step | Dense text distracts from current real-time order status and ETA. | Hard to tell at a glance if food is baking or out for delivery. | **Medium** |
| **P-11** | Feedback & Micro-interactions | Instant state updates on cart add/update with zero motion or tactile response | Users frequently double-tap "+ Add" because there is no immediate visual confirmation on the card. | Accidental duplicate quantities in cart. | **Low** |
| **P-12** | `NavigationDrawer.tsx` | Text links list with mixed emoji sizes | Functional but feels like a generic template rather than a premium restaurant brand. | Misses brand storytelling opportunity. | **Low** |

---

## 6. PROPOSED AY PIZZA UNIFIED DESIGN SYSTEM

The design system is structured to serve **both** the Customer Mobile App and the future AY Pizza Operations App (KDS, Rider Dispatch, Admin Dashboard), ensuring brand unity while supporting operational screen requirements.

### 6.1 Approved Brand Color Palette & Semantics

```
+-----------------------------------------------------------------------------------------+
| PRIMARY ACCENTS                                                                         |
| Pizza Red:       #B91C1C   (Pantone 186 C)   -> Primary CTAs, active states, key icons  |
| Chocolate Brown: #3E2723   (Pantone 412 C)   -> Premium headers, drawer, borders, text  |
| Golden Orange:   #F59E0B   (Pantone 137 C)   -> Crust badges, ratings, highlights, stars|
|                                                                                         |
| CANVASES & SURFACES                                                                     |
| Warm Cream:      #FFF7E6   (Background)      -> Main app canvas, warm appetizing tint   |
| Surface Card:    #FFFFFF   (Cards & Modals)  -> Elevated cards, input fields, sheets    |
| Soft Cream:      #FFF0D4   (Card Secondary)  -> Inset containers, segmented pill tracks |
| Tomato Tint:     #FEE2E2   (Status / Error)  -> Subtle alert backgrounds, cancelled tag |
| Basil Tint:      #DCFCE7   (Status / Success)-> In-stock tag, delivery active badge     |
|                                                                                         |
| TYPOGRAPHY & CONTRASTS                                                                  |
| Charcoal:        #1F1F1F   (Text Primary)    -> High-contrast headings and body text    |
| Warm Bark:       #5D4037   (Text Secondary)  -> Secondary descriptions, subtitles       |
| Stone Muted:     #8D6E63   (Text Muted)      -> Captions, timestamps, placeholder text  |
| Pure White:      #FFFFFF   (Text Inverted)   -> Text on Red / Chocolate buttons         |
+-----------------------------------------------------------------------------------------+
```

### 6.2 Typography Scale & Text Tokens

All typography tokens map to system fonts with cross-platform weight alignment:

| Token Name | Font Size | Line Height | Font Weight | Letter Spacing | Primary Usage |
|---|:---:|:---:|:---:|:---:|---|
| `Typography.displayLarge` | 28px | 34px | `900` (Black) | -0.6px | Hero headlines, launch screen wordmark |
| `Typography.displayMedium` | 22px | 28px | `800` (ExtraBold) | -0.4px | Screen titles, receipt total, modal titles |
| `Typography.headline` | 18px | 24px | `800` (ExtraBold) | -0.2px | Section headers, product detail title |
| `Typography.titleMedium` | 15px | 20px | `700` (Bold) | 0px | Product card names, card headers |
| `Typography.bodyLarge` | 14px | 20px | `500` (Medium) | 0.1px | Primary descriptions, form inputs |
| `Typography.bodyMedium` | 13px | 18px | `400` (Regular) | 0.1px | Secondary item details, FAQ answers |
| `Typography.caption` | 12px | 16px | `600` (SemiBold) | 0.2px | Landmark subtext, timestamps, price unit |
| `Typography.microBadge` | 11px | 14px | `800` (ExtraBold) | 0.4px | Status tags, culinary badges, pills (MINIMUM SIZE) |
| `Typography.buttonPrimary` | 14px | 20px | `800` (ExtraBold) | 0.3px | Primary CTA button text (ALL CAPS or Title Case) |

> [!IMPORTANT]
> **Strict Accessibility Rule:** No text token in the entire design system may render below **11px**. Font sizes of 8px and 9px are completely eliminated.

### 6.3 Spatial & Elevation Scale

```typescript
export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  pill: 9999,
} as const;
```

**Elevation & Shadows:**
- `Shadows.subtle`: Android `elevation: 2`, iOS `shadowColor: '#3E2723'`, `opacity: 0.05`, `radius: 6`, `y: 2`. Used on standard product cards.
- `Shadows.elevated`: Android `elevation: 6`, iOS `shadowColor: '#1F1F1F'`, `opacity: 0.10`, `radius: 12`, `y: 4`. Used on floating cart bar and active cards.
- `Shadows.modal`: Android `elevation: 16`, iOS `shadowColor: '#000000'`, `opacity: 0.22`, `radius: 24`, `y: 8`. Used on bottom sheets.

### 6.4 Component Building Blocks

1. **Buttons (`AYButton`):**
   - **Primary Red:** Background `#B91C1C`, Text `#FFFFFF`, Height 48dp, Radius 14dp, active opacity 0.85.
   - **Secondary Cream:** Background `#FFF0D4`, Text `#3E2723`, Height 48dp, Radius 14dp, border 1dp `#E6D3B3`.
   - **Chocolate Accent:** Background `#3E2723`, Text `#F59E0B`, Height 48dp, Radius 14dp.
   - **Destructive Ghost:** Background `transparent`, Text `#B91C1C`, Height 44dp, border 1dp `#FCA5A5`.
   - **Compact Counter Stepper:** Height 36dp, min-width 90dp, circular minus/plus buttons with 40dp touch target slop.
2. **Input Fields (`AYTextInput`):**
   - Background `#FFFFFF`, Border 1.5dp `#E8DFD8`, Radius 12dp, Padding 14dp, Font size 14dp.
   - Active focus state: Border 1.5dp `#B91C1C`, subtle cream aura.
3. **Product Card Variant (`AYProductCard`):**
   - **Grid Card (Discovery):** 160dp width, 130dp top image with subtle 10dp radius, title (14dp bold), base price (15dp red), compact "+ Add" pill button.
   - **List Card (Full Menu):** Horizontal layout, 96×96dp image on left, right body with name, description, size chips preview, and bottom price + CTA row.
4. **Bottom Sheet Shell (`AYBottomSheet`):**
   - Drag handle pill (40×4dp, `#D7CCC8`), top radius 24dp, safe area inset padding, non-scrollable sticky action footer.

---

## 7. SCREEN-BY-SCREEN REDESIGN RECOMMENDATIONS

### 7.1 Home Screen: The "Fast Campus Bites" Redesign
- **Current Problem:** 450dp of non-menu headers, banners, and notices push food items below the fold.
- **Redesign Blueprint:**
  1. **Top Bar (Compact):**
     - Left: Monogram logo + "AY Pizza UNILAG" (14dp bold).
     - Center: Compact delivery destination pill ("🛵 King Jaja Hall ▾", taps to open quick landmark picker).
     - Right: Hamburger icon (☰) and search shortcut icon.
  2. **Hero Food Carousel (Streamlined):**
     - Height reduced to 120dp. Background displays warm appetizing food imagery with a subtle left-to-right gradient scrim.
     - Single headline: *"Stone-Oven Baked Pizza • Hot in 15 Mins"*.
     - One-tap action: *"Order Now 🍕"*.
  3. **Category Chips Row:**
     - Sticky horizontal scroll of rounded pill chips (`All Menu`, `🍕 Pizzas`, `🍦 Shakes & Cones`, `🍔 Burgers & Wings`, `🥤 Drinks`).
     - Active chip turns solid `#B91C1C` with white text.
  4. **Dynamic 2-Column Food Grid (Replacing Dense Vertical List):**
     - Display Campus Bestsellers in an appetizing 2-column card grid (similar to Chowdeck and Uber Eats).
     - Each card features a 120dp food image, culinary tag (Spicy 🌶️, Real Dairy 🍨), bold title, price, and "+ Add" floating pill button.
  5. **Campus Delivery Trust Strip:**
     - Compact single-row banner at the bottom: *"📍 Opposite King Jaja Hall • 10 AM – 9 PM • Flat ₦500 Campus Delivery"*.

### 7.2 Menu Catalog & Search Screen
- **Current Problem:** Separate search bar, separate category bar, and generic vertical list.
- **Redesign Blueprint:**
  - Modern search bar with an integrated camera/clear icon and recent search tags.
  - Sticky sub-header category bar that highlights dynamically as the user scrolls past category sections.
  - Category sections clearly marked with appetizing section headers (e.g. "Signature Artisan Pizzas (12)", "Soft-Serve & Thick Shakes (6)").
  - Skeleton shimmer placeholder cards during initial load to eliminate the cold white screen.

### 7.3 Interactive Pizza Customizer: The "Artisan Build" Modal
- **Current Problem:** Long scrolling list with plain text dropdown for Half & Half.
- **Redesign Blueprint:**
  1. **Visual Size Selector:** Horizontal row of 3 to 5 circular crust size selectors (Regular 9", Standard 10", Large 12", Queen 14", King 16") with crust diameter visual icons and price deltas.
  2. **Interactive Half & Half Pizza Splitter:**
     - Segmented toggle: `[ Full Single Recipe ]` vs `[ 50/50 Half & Half Split ]`.
     - When toggled on, an interactive pizza graphic displays Side A (Current Pizza) and Side B (Select Secondary Flavor from a horizontal carousel of available pizza photos).
  3. **Grouped Toppings Accordion:** Group toppings into `Extra Cheeses`, `Premium Meats & Suya`, `Fresh Veggies`. Each item has a circular checkbox and clear `+₦Price`.
  4. **Sticky Action Bar:** Always visible at bottom with real-time recalculated price: `₦4,800` and bold CTA `[ Add to Order • ₦4,800 ]`.

### 7.4 Cart & Pre-Checkout Screen: The "Decluttered Tray"
- **Current Problem:** 5 stacked bordered cards create visual overwhelm.
- **Redesign Blueprint:**
  1. **Consolidated Fulfillment Strip:** Segmented control (`🛵 Delivery` vs `🏬 Pickup`) integrated cleanly at top. Below it, a single line shows the selected landmark and room number with an "Edit" button.
  2. **Clean Item List:** Borderless item rows on white card surface with subtle 1dp dividers. Clean 60×60 image thumbnail, bold title, customization tag pills, and a compact `[-] 1 [+]` stepper.
  3. **Transparent Price Breakdown:**
     - Subtotal: ₦X,XXX
     - Campus Delivery (UNILAG Landmark): ₦500
     - Total: **₦X,XXX** (Large 18dp bold text)
  4. **Eliminate Redundant Disclaimers:** Replace the large campus quality card and checkout readiness card with a subtle 1-line green verification badge: *"✅ Verified for King Jaja Kitchen Delivery"*.
  5. **High-Impact Sticky Checkout Button:** Full-width `#B91C1C` button pinned above navigation bar.

### 7.5 Order Tracking Screen: The "Live Oven Journey"
- **Current Problem:** Heavy text descriptions for all 5–6 milestones overwhelm the screen.
- **Redesign Blueprint:**
  1. **Hero Status Header:**
     - Animated pizza oven graphic for `PREPARING`, bike graphic for `IN_TRANSIT`, box graphic for `READY_FOR_PICKUP`.
     - Prominent headline: *"Your Pizza is in the Stone Oven 🔥"*
     - Estimated time badge: *"Ready in ~12–18 mins"*.
  2. **Horizontal Stepper Bar:** Replace vertical wall of text with a modern 5-step horizontal progress bar with checkmarks for completed stages and a pulsing glow on the current stage.
  3. **Direct Contact Action Bar:** Two prominent floating pills:
     - `[ 📞 Call Kitchen ]` (One-tap phone call)
     - `[ 💬 WhatsApp Chat ]` (One-tap WhatsApp support)
  4. **Item Summary Accordion:** Collapsed by default; expands to show purchased items and paid receipt reference.
  5. **Safe Cancellation Button:** Prominently visible only when order is `CONFIRMED`, styled in subtle ghost red.

### 7.6 Customer Account & Orders History
- **Current Problem:** Standard list view with repetitive navigation rows.
- **Redesign Blueprint:**
  - Modern profile header with monogram avatar, gold membership pill, and student phone number.
  - Active orders surfaced in an elevated "Live Order in Progress" card right at top of Account tab.
  - Grouped setting cards: `Order Preferences` (Saved Addresses, Payment Methods), `App Settings` (Push Notifications, Dark/Light Mode), `Support & Legal` (Help, Terms, Privacy).

---

## 8. OPERATIONS APP SYSTEM PARITY & ADAPTATION

The proposed Design System must scale seamlessly to the upcoming AY Pizza Operations application serving kitchen staff, delivery riders, and store managers:

```
+-----------------------------------------------------------------------------------------+
| SHARED DESIGN SYSTEM CORE                                                               |
| Tokens: Colors (#B91C1C, #3E2723, #FFF7E6, #F59E0B), Typography, Spacing, Radius       |
+-----------------------------------------------------------------------------------------+
            |                                 |                                 |
            v                                 v                                 v
+-----------------------+         +-----------------------+         +-----------------------+
| CUSTOMER APP          |         | KITCHEN DISPLAY (KDS) |         | RIDER DISPATCH APP    |
| (Appetizing & Fast)   |         | (High-Contrast Tiles) |         | (High-Mobility View)  |
| - 2-column food grid  |         | - Dark canvas (#1F1F) |         | - Route card stack    |
| - Artisan customizer  |         | - Color-coded timer   |         | - 1-tap call customer |
| - 1-tap reorder tray  |         | - Ticket status pills |         | - Swipe to complete   |
+-----------------------+         +-----------------------+         +-----------------------+
```

### 8.1 Kitchen Display System (KDS) Adaptation
- **Canvas:** Dark charcoal canvas (`#1F1F1F`) to reduce eye strain under kitchen fluorescent lighting.
- **Order Tickets:** High-contrast white card tiles with color-coded elapsed time banners:
  - Green (`#287A4B`): 0–10 mins
  - Amber (`#F59E0B`): 10–20 mins
  - Flashing Red (`#B91C1C`): 20+ mins
- **Typography:** Uses `Typography.displayMedium` for Order Number (`#1042`) and Large Items so cooks can read tickets from 2 meters away.

### 8.2 Rider Operations App Adaptation
- **Canvas:** High-contrast daylight mode optimized for outdoor sunlight visibility on motorcycle mounts.
- **Assigned Order Cards:** Stack of active deliveries showing delivery landmark (e.g. "Mariere Hall, Block B"), recipient name, and 1-tap "Call Customer" shortcut.
- **Status Progression:** Large swipeable slider button: `[ Swipe when In Transit 🛵 ]` → `[ Swipe to Confirm Handover ✅ ]`.

---

## 9. FUNCTIONAL REGRESSION SAFEGUARDS & INVARIANT ARCHITECTURE

Visual and styling enhancements must strictly preserve the following backend integrations and runtime invariants:

```
+-----------------------------------------------------------------------------------------+
| CRITICAL FUNCTIONAL INVARIANTS — DO NOT COMPROMISE IN REDESIGN                          |
+-----------------------------------------------------------------------------------------+
| 1. Paystack Verification  | Never bypass webhook or server verify. Never store card     |
|                           | numbers on device. Preserve staged simulation safeguards.   |
| 2. Price Authority        | Cart prices are strictly provisional; authoritative totals  |
|                           | are computed by database RPCs (orderService / create_order).|
| 3. Guest SecureStore      | Never clear or break GuestReceiptStore. Guest orders must   |
|                           | persist across app restarts without customer login.         |
| 4. Cancellation Rules     | Customer self-cancellation is permitted ONLY while order    |
|                           | status is CONFIRMED. Once ACCEPTED by kitchen, disable CTA. |
| 5. Landmark Tariffs       | All delivery fee calculations must route through the        |
|                           | deliveryPricingEngine and authoritative database table.     |
| 6. Push Notifications     | Do not decouple notificationService.registerForPushNotifications |
|                           | from customer login and order tracking lifecycles.          |
+-----------------------------------------------------------------------------------------+
```

---

## 10. RECOMMENDED IMPLEMENTATION SEQUENCE & FIRST SCREENS TO REDESIGN

To minimize disruption and deliver immediate visual impact, the redesign should be executed in 4 focused phases:

### Phase 1: Design Tokens Unification & Foundation (IMMEDIATE)
1. **Unify `src/constants/colors.ts`:** Consolidate legacy colors into the approved brand tokens (`#B91C1C`, `#3E2723`, `#FFF7E6`, `#F59E0B`, `#1F1F1F`).
2. **Update `src/constants/theme.ts`:** Standardize typography scale, eliminate sub-11px font sizes, and define standard component elevations.
3. **Verify Zero Regressions:** Run full test suite (`npx jest`) to confirm no broken color references.

### Phase 2: High-Impact Customer Discovery Screens (FIRST SCREENS TO REDESIGN)
1. **Redesign Screen A: `ProductCard.tsx`**
   - Shift from cramped 78×78 thumbnail to modern appetizing card layout with prominent price, culinary badge, and clear CTA.
2. **Redesign Screen B: `HomeScreen.tsx`**
   - Compact the fulfillment card into a single-line header pill.
   - Introduce the 2-column food discovery grid.
   - Streamline hero carousel.
3. **Redesign Screen C: `CartView.tsx` & Floating Cart Bar**
   - Collapse 5 nested bordered cards into a clean, modern order tray.
   - Align floating cart bar styling with the Chowdeck-inspired high-contrast pill.

### Phase 3: Interactive Customizer & Ordering Journey
1. **Redesign Screen D: `CustomizerModal.tsx`**
   - Implement visual crust size selector and Half & Half 50/50 split builder.
2. **Redesign Screen E: `CheckoutModal.tsx` & `OrderReceiptModal.tsx`**
   - Streamline checkout form inputs and harmonize the digital receipt card.

### Phase 4: Order Lifecycle & Account Experience
1. **Redesign Screen F: `OrderTrackingModal.tsx`**
   - Implement horizontal milestone stepper, animated baking indicator, and 1-tap WhatsApp/Call actions.
2. **Redesign Screen G: `OrdersScreen.tsx` & `AccountScreen.tsx`**
   - Polish history tabs and profile management cards.

---

## 11. CONCISE EXECUTIVE CONCLUSION

The AY Pizza & Ice Cream mobile codebase possesses an outstanding technical architecture. By unifying the color palette around the approved Artisan Pizza Red (`#B91C1C`), Chocolate Brown (`#3E2723`), and Warm Cream (`#FFF7E6`), decluttering dense explanatory text, upgrading product card photography, and adopting a 2-column discovery grid, the customer application will transition from an engineering prototype to a premium, market-leading restaurant ordering experience.

**Recommended Immediate Next Step:** Approve the Design System tokens in Section 6 and authorize Phase 1 & 2 redesign execution focusing on `colors.ts`, `ProductCard.tsx`, and `HomeScreen.tsx`.

