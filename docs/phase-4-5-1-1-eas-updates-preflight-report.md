# AY Pizza — Phase 4.5.1.1: EAS Updates Configuration and Android Build Preflight Report

**Execution Date:** 2026-10-28  
**Checkpoint Branch:** `checkpoint/phase-4-2-3-1`  
**Base Commit:** `78083cc` (Phase 4.5.1 Milestone)  
**Expo SDK:** 58.0.19 / React Native 0.88.0 / React 19.3.0 / TypeScript 6.0.2  
**EAS Project ID:** `a0aaa783-3f92-4b05-b32f-e44ccc7bfd38`  
**EAS Project Owner:** `shinobi04`

---

## 1. Executive Summary

Following the execution of `npx eas build --platform android --profile preview`, the EAS CLI authenticated the user session, automatically installed and linked `expo-updates`, initialized the EAS project ID, and updated the configuration.

This preflight investigation audited all automated changes, corrected configuration schema deviations, audited Node.js engine compatibility, classified npm audit vulnerabilities, hardened environment variable failure paths, and established the exact preflight steps needed prior to triggering the cloud Android APK compilation.

---

## 2. Expo Updates Configuration Audit

### 2.1 Configuration Verified
The automated EAS Update installation updated `app.json` and `package.json`:
- **Package Added:** `expo-updates: "~58.0.19"` (exact match with Expo SDK 58.0.19).
- **Updates URL:** `https://u.expo.dev/a0aaa783-3f92-4b05-b32f-e44ccc7bfd38` (matching EAS Project ID `a0aaa783-3f92-4b05-b32f-e44ccc7bfd38` owned by `shinobi04`).
- **Runtime Version Policy:** `"runtimeVersion": { "policy": "appVersion" }`. Matches app version `1.0.0`.
- **Channel Association in `eas.json`:**
  - `preview` profile → `"channel": "staging"`.
  - `production` profile → `"channel": "production"`.
  - `development` profile → Uses development client without channel collision.
- **Isolation Confirmed:** Preview APKs built with profile `preview` only receive OTA updates published to the `staging` channel; production builds receive updates published strictly to the `production` channel.

### 2.2 Fixes Applied to `app.json`
1. **Removed Invalid `splash` Key:** In Expo SDK 58, top-level `"splash"` is deprecated/removed from `app.json` schema. Removing it resolved the `expo-doctor` schema validation failure.
2. **Deduplicated Android Permissions:** Cleaned up duplicated entries for `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED`.
3. **Preserved Expo Router Config:** Maintained `"extra": { "router": { "origin": false }, "eas": { ... } }`.

---

## 3. Dependency & CLI Configuration Audit

### 3.1 Dependency State
- **`expo-updates` (`~58.0.19`):** Officially supported Expo SDK 58 module for Over-The-Air (OTA) runtime updates.
- **`eas-cli` Uninstalled from Project Dependencies:**
  - `eas-cli` was temporarily added to `devDependencies`. Both `expo-doctor` and EAS CLI itself recommend against local project dependency installation:
    > *"Found eas-cli in your project dependencies. It's recommended to use the 'cli.version' field in eas.json to enforce the version instead of adding it to package.json."*
  - `eas.json` already enforces this via `"cli": { "version": ">= 12.0.0" }`.
  - Removing `eas-cli` from `package.json` eliminated 15 transitive vulnerabilities from `node_modules` and satisfied `expo-doctor`.

---

## 4. Node.js Compatibility Analysis & Recommendations

### 4.1 Current Environment Diagnostic
- **Installed Node.js Version:** `v25.1.0` (odd-numbered non-LTS development release).
- **Engine Warnings Encountered:**
  - `@react-native/asset-utils@0.88.0` requires `{ node: '^22.13.0 || ^24.3.0 || >= 26.0.0' }`
  - `react-native@0.88.0` requires `{ node: '^22.13.0 || ^24.3.0 || >= 26.0.0' }`
  - `expo@58.0.19` requires `{ node: '^22.13.0 || ^24.3.0 || ^26.0.0 || >=27.0.0' }`
  - `metro@0.87.1` requires `{ node: '^22.13.0 || ^24.3.0 || >= 26.0.0' }`

### 4.2 Recommended Supported Node Version
- **Recommended:** **Node.js 22 LTS (Active LTS, v22.14.0+)**
- React Native and Expo officially support active even-numbered LTS releases. Node 25 can introduce subtle V8 JIT regressions, Metro bundler file-watching glitches, and npm caching locks on Windows.

### 4.3 Windows Node 22 LTS Setup Instructions (Manual)
To switch to Node 22 LTS on Windows without breaking other tools:
1. **Option A: Using NVM for Windows (Recommended):**
   ```powershell
   # In PowerShell (Run as Administrator)
   winget install CoreyButler.NVMforWindows
   # Reopen PowerShell
   nvm install 22.14.0
   nvm use 22.14.0
   node -v  # Verify: v22.14.0
   ```
2. **Option B: Direct MSI Installer:**
   - Download the official Node.js 22 LTS installer from [nodejs.org](https://nodejs.org/) (`node-v22.x.x-x64.msi`).
   - Run the installer and restart the terminal.

*(Note: EAS Cloud builds execute in Expo's cloud containers on Linux with LTS Node and are unaffected by the local Node version).*

---

## 5. Environment Variable Audit & Staging Safeguards

### 5.1 Hardened Runtime Safeguards
Previously, `src/domains/catalog/catalog-repository.ts` only blocked placeholder fallbacks when `Config.isProduction === true`. In `staging` builds, missing variables would silently fall back to offline demo data (`SEEDED_CATEGORIES`), concealing build-time configuration failures.

**Modifications Made:**
1. Updated `src/config/env.ts` to export `validateEnvironmentConfig()`, asserting valid non-placeholder values whenever `Config.appEnv` is `'staging'` or `'production'`.
2. Updated `getCategories()` and `getProducts()` in `src/domains/catalog/catalog-repository.ts` to reject placeholder credentials in both `staging` and `production` with:
   ```text
   FATAL CONFIGURATION ERROR: Live Supabase database credentials must be configured in staging. Fallback demo catalog is disabled in staging.
   ```

### 5.2 Required Variables for Preview Build
The `preview` APK requires the following client-facing variables:
1. `EXPO_PUBLIC_APP_ENV`: `"staging"` (already declared in `eas.json` under `build.preview.env`).
2. `EXPO_PUBLIC_SUPABASE_URL`: AY Pizza staging URL (`https://gmtlwewpblnnkzuwfcib.supabase.co`).
3. `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Staging Supabase anon public key.
4. `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY`: Paystack test public key (`pk_test_*`).

### 5.3 Configuring Preview Environment Variables in EAS
Because EAS Cloud compiles the APK in an isolated cloud container without access to the local `.env` file, the 3 staging variables must be configured in EAS.

Choose either method below:

#### Method 1: Via EAS CLI (Secure Terminal Commands)
Run these commands in PowerShell (replace `<VALUE>` with the respective value from your local `.env`):
```powershell
npx eas env:create --environment preview --variable EXPO_PUBLIC_SUPABASE_URL="<YOUR_STAGING_SUPABASE_URL>"
npx eas env:create --environment preview --variable EXPO_PUBLIC_SUPABASE_ANON_KEY="<YOUR_STAGING_ANON_KEY>"
npx eas env:create --environment preview --variable EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY="<YOUR_PAYSTACK_TEST_PUBLIC_KEY>"
```

#### Method 2: Via Expo Web Dashboard
1. Navigate to: `https://expo.dev/accounts/shinobi04/projects/ay-pizza/environment-variables`
2. Click **Create variable**.
3. Select **Environment**: `preview`.
4. Add:
   - Name: `EXPO_PUBLIC_SUPABASE_URL`
   - Name: `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - Name: `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY`
5. Save.

---

## 6. npm Audit Vulnerability Classification

A complete audit of `npm audit` was conducted following the removal of `eas-cli`. 14 vulnerabilities remain across 1105 audited packages:

| Dependency | Severity | Type | Direct / Transitive | Actual App Exposure | Non-Breaking Remediation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `deepmerge` (>=4.2.0) | Low | Dev / Build Tooling | Transitive (`@expo/config`, `jest-config`) | **None.** Only used during local CLI config parsing and Jest test execution. Never packaged into the mobile APK bundle. | Retain. `npm audit fix --force` would dangerously downgrade Expo to SDK 51. |
| `node-forge` (<=1.4.0) | High | Dev / Server Tooling | Transitive (`@expo/cli`) | **None.** Used for self-signed certificates in local development servers. Not compiled into native mobile runtime. | Fixed upstream in future Expo CLI minor patch. Safe to ignore in app runtime. |
| `zod` (<4.6.6) | High | Dev / Build Tooling | Transitive (`@expo/cli`) | **None.** Used by Expo CLI to validate developer config schema. Mobile client does not bundle `@expo/cli`. | Retain. Breaking downgrade suggested by npm audit is unacceptable. |

**Conclusion:** 0 vulnerabilities affect the client application runtime or physical Android device security. All 14 advisories belong to build-time development tools (`@expo/cli`, `jest`).

---

## 7. Verification Results

| Check | Tool / Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **Jest Test Suite** | `npm test -- --watchAll=false` | **PASS (20/20 suites, 258/258 tests)** | All customizer, cart, order calculation, auth, KDS, and payment tests passed cleanly. |
| **TypeScript Typecheck** | `npx tsc --noEmit` | **PASS (0 errors)** | Exit code 0 across the entire codebase. |
| **Expo Public Config** | `npx expo config --type public` | **PASS** | `name: "AY Pizza"`, `android.package: "ng.aypizza.app"`, `scheme: "aypizza"`, `updates.url` and `runtimeVersion` properly resolved. |
| **Expo Doctor** | `npx expo-doctor` | **19/20 Checks Passed** | Schema check passed; CLI check passed. Only 1 advisory remaining (minor patch pin advisory for `expo ~58.0.21` vs `58.0.19`). |

---

## 8. Exact Outstanding Actions & Cloud Build Command

Before executing the cloud Android APK build:

1. **Verify or set EAS environment variables for preview:**
   Configure `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` in the Expo Dashboard or via `npx eas env:create --environment preview ...` as described in Section 5.3.

2. **Trigger the Cloud Preview APK Build:**
   ```bash
   npx eas build --platform android --profile preview
   ```
   *(EAS will now detect the linked updates configuration, pull the preview environment variables, compile the standalone Android APK, and output the installable download URL).*
