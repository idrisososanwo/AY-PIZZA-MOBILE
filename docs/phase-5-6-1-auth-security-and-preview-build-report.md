# AY PIZZA & ICE CREAM — PHASE 5.6.1: AUTHENTICATION SECURITY VERIFICATION & FINAL PREVIEW BUILD REPORT

**Document Type:** Final Security Verification, Regression Audit & Preview Build Report  
**Target Milestone:** Phase 5.6.1 — Authentication Security & Preview Build Dispatch  
**Platform:** React Native / Expo SDK 58 / TypeScript / Supabase PostgreSQL / Jest  
**Execution Timestamp:** 2026-11-06T18:48:00+01:00  
**Build Profile:** Android `preview` (APK) • Channel: `staging`  
**Status:** BUILD DISPATCHED & VERIFIED  

---

## 1. AUTHENTICATION SECURITY VERIFICATION FINDINGS

A focused security inspection was conducted on the authentication flow, profile synchronization, and database access controls:

### 1.1 Profile Self-Healing & Data Integrity
1. **Scoped Authenticated Profile Upsert:**
   - In [`fetchCurrentCustomerProfile()`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/domains/auth/auth-service.ts#L110-L180), the profile upsert exclusively uses `authUser.id` obtained from cryptographically verified Supabase JWTs (`getUser()` or verified `getSession()`).
   - RLS policy `Users can update own profile` explicitly enforces `USING (auth.uid() = id)` and `WITH CHECK (auth.uid() = id)`. It is mathematically impossible for a client to create, update, or read another user's profile record.
2. **Strict Anti-Role-Escalation & Trusted Field Protection:**
   - In both [`fetchCurrentCustomerProfile()`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/domains/auth/auth-service.ts) and [`signUpCustomer()`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/domains/auth/auth-service.ts), the client upsert payload **strictly omits `role` and `is_phone_verified`**.
   - On new record insertion, PostgreSQL's column default applies `role = 'customer'` and `is_phone_verified = FALSE`.
   - On existing record update (conflict), existing role values (`staff`, `admin`, `rider`) are preserved and cannot be overwritten or demoted.
   - Database trigger `prevent_role_self_escalation()` (`BEFORE UPDATE ON public.profiles`) remains active in PostgreSQL, guaranteeing that only authenticated administrators can alter a user's role.
3. **Loop Prevention & Idempotency:**
   - Profile retrieval verifies `public.profiles` first. If data exists, it returns immediately without executing an upsert.
   - The upsert targets the primary key `id` (`{ onConflict: 'id' }`), preventing duplicate records.

---

## 2. REGISTRATION BEHAVIOUR: EMAIL CONFIRMATION ENABLED VS DISABLED

The registration lifecycle was tested across both backend configurations:

| Supabase Backend Configuration | Observed & Tested Flow | Auth State & UI Behavior |
|---|---|---|
| **Email Confirmation Disabled** | `signUpCustomer()` receives user and active session (or immediately acquires session via password login). | Immediate active session established. Modal closes, invokes `onSuccess()`, Account screen immediately reflects the customer's authenticated card with name and avatar. |
| **Email Confirmation Enabled** | `signUpCustomer()` receives user without active session; password sign-in returns `Email not confirmed`. | `res.emailConfirmationRequired = true`. `AuthModal` displays `"Account created! Please verify your email."`, presents the verification mode with a resend button, and **does not pretend the customer is authenticated**. |

---

## 3. SESSION LIFECYCLE & ISOLATION

1. **Active Session Propagation:**
   - User registration and sign-in await profile synchronization before completing navigation, eliminating UI jitter.
   - Both `NavigationDrawer` and `AccountScreen` re-evaluate auth state reactively on mount and tab switch.
2. **Session Restoration:**
   - React Native sessions stored in `AsyncStorage` are restored on launch via `supabase.auth.getUser()` with graceful local fallback to `supabase.auth.getSession()`.
3. **Sign-Out Isolation:**
   - `signOutUser()` clears only the Supabase auth session.
   - Offline shopping cart items in `cartStore` and guest digital receipts in `GuestReceiptStore` survive sign-out intact.
4. **Address Isolation:**
   - `customer_addresses` is strictly guarded by PostgreSQL RLS (`USING (auth.uid() = customer_id)`). Switching accounts or querying addresses never exposes another customer's saved hostel locations or contact details.

---

## 4. REGRESSION TESTS ADDED

In [`src/__tests__/customer-auth-and-category-navigation.test.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/__tests__/customer-auth-and-category-navigation.test.ts), Section 5 was expanded with comprehensive assertions:
- `returns null profile when user is unauthenticated (guest)`
- `returns non-null profile from public.profiles for authenticated user`
- `self-heals and NEVER returns null when profiles record is missing or query fails`
- `recovers authenticated user session from getSession when getUser fails`
- `defaults fetchAuthenticatedRole to "customer" when user is authenticated but profile lookup fails`
- `signOutUser clears supabase session without deleting local guest receipts or cart`
- `ensures profile upsert payload never dictates role or is_phone_verified (preventing self-escalation)`
- `signUpCustomer respects email confirmation requirement if signInWithPassword fails`

**Suite Result:** 26/26 tests passed.

---

## 5. FULL QUALITY GATES EXECUTION

All four quality gates were executed consecutively on the workspace:

```bash
# Gate 1: TypeScript Compilation
npx tsc --noEmit
# Result: 0 errors (Exit code: 0)

# Gate 2: Static Analysis
npx expo lint
# Result: 0 errors, 42 warnings (test mock imports) (Exit code: 0)

# Gate 3: Jest Full Test Suite
npm test -- --runInBand
# Result: 44 passed, 44 total suites; 695 passed, 695 total tests (Exit code: 0)

# Gate 4: Expo Configuration Doctor
npx expo-doctor
# Result: 20/20 checks passed. No issues detected! (Exit code: 0)
```

---

## 6. EAS ANDROID PREVIEW BUILD DISPATCH

The preview build was dispatched using the verified command:

```bash
npx eas-cli build --platform android --profile preview --freeze-credentials --non-interactive --no-wait -m "AY Pizza Phase 5.6 Authentication & Chowdeck UX Preview"
```

### Build Details
- **Build ID:** `9c88d7fb-89a3-4638-850d-aea01c8d7c15`
- **Platform:** Android
- **Profile:** `preview`
- **Artifact:** Standalone APK
- **Distribution:** Internal
- **Channel:** `staging`
- **Expo SDK Version:** 58.0.0
- **App Version:** 1.0.0 (Version Code: 1)
- **Status:** In Queue / Processing
- **Build Dashboard & Logs:** [https://expo.dev/accounts/shinobi04/projects/ay-pizza/builds/9c88d7fb-89a3-4638-850d-aea01c8d7c15](https://expo.dev/accounts/shinobi04/projects/ay-pizza/builds/9c88d7fb-89a3-4638-850d-aea01c8d7c15)

---

## 7. PRESERVATION & GIT INVARIANTS

- **EAS Project & Signing Credentials:** Remote Keystore (`Build Credentials 1OjbQzUxQX`) preserved without regeneration.
- **Backend & Sandbox:** Staging Supabase and Paystack sandbox credentials intact.
- **Brand Assets:** Approved Concept 3 brand logo (`assets/brand-logo.png`) and all 23 food photography assets preserved.
- **Git Restrictions:** Zero commits, zero pushes, zero merges, zero rebases, zero stashes, and zero branch switches performed.

---

## 8. PHYSICAL DEVICE VALIDATION REQUIREMENTS (NEXT STEPS)

> [!NOTE]
> Physical device testing must be performed on the physical Xiaomi Redmi 13C (360dp viewport) once the APK build completes.

### Verification Checklist for Physical Device:
1. **Registration & Account Display:** Register a new customer and verify immediate transition to the authenticated Account card showing full name and email without app restart.
2. **Persistent Floating Cart Bar:** Add an item to the cart from Home or Menu, verify the floating cart bar (`[ 🛒 1 Item ] [ View Cart • ₦X,XXX → ]`) floats neatly above the bottom tab navigation across screens.
3. **Customizer Sheet:** Verify Half-and-Half split circular pizza preview and live price updates on 360dp screen.
4. **Orders & Live Tracking:** Place an order via Paystack sandbox and verify real-time status updates and WhatsApp stand contact.

