# AY PIZZA & ICE CREAM — PHASE 5.4.3 STEP 5
## EAS Android Preview Build Dispatch Report

**Project:** AY Pizza & Ice Cream Customer Mobile Application (`ng.aypizza.app`)  
**Phase:** 5.4.3 Step 5 — Cloud Preview Build  
**Date:** November 5, 2026  
**Operator:** Senior Mobile & Backend Architecture Pair  
**Baseline Git Branch:** `checkpoint/phase-4-2-3-1` (HEAD: `b62cc67`)  
**EAS Project:** `@shinobi04/ay-pizza` (`a0aaa783-3f92-4b05-b32f-e44ccc7bfd38`)  
**Keystore Profile:** `Build Credentials 1OjbQzUxQX (default)` (Frozen)  

---

## 1. Pre-Build Verification Results

| Verification Item | Required Specification | Observed State | Status |
|:---|:---|:---|:---:|
| **Working Directory** | AY PIZZA MOBILE workspace | `C:\Users\Ososanwo Idris\Documents\AY PIZZA MOBILE` | **PASS** |
| **Active Git Branch** | `checkpoint/phase-4-2-3-1` | `checkpoint/phase-4-2-3-1` | **PASS** |
| **Git Working Tree** | No files discarded or overwritten | 32 modified, 19 untracked files preserved | **PASS** |
| **EAS Project ID** | `a0aaa783-3f92-4b05-b32f-e44ccc7bfd38` | `app.json` line 60 matches exactly | **PASS** |
| **Preview Profile** | Internal distribution, APK, staging channel & env | `eas.json` lines 13–22 match exactly | **PASS** |
| **Environment Config** | Supabase Staging & Paystack Sandbox keys intact | `.env` file present, 4 keys loaded | **PASS** |
| **Code Freeze** | No ad-hoc modifications made for build | No modifications made to bypass checks | **PASS** |

---

## 2. Build Execution Details

### 2.1 Command Execution Sequence
1. **Initial Command:**
   ```bash
   npx eas-cli@latest build --platform android --profile preview --freeze-credentials
   ```
   - **Observed Behavior:** Failed immediately during `npx` package fetch due to an upstream npm/semver bug in Node.js v24 (`npm error Invalid Version:` inside `@npmcli/arborist`).
   - **Remediation:** Executed via the pre-installed, verified EAS CLI v26.0.0 binary (`npx eas-cli build`), which satisfies the project requirement (`eas.json: "cli": { "version": ">= 12.0.0" }`).

2. **Final Dispatched Command:**
   ```bash
   npx eas-cli build --platform android --profile preview --freeze-credentials --non-interactive --no-wait -m "Phase 5.4.3 Tracking Experience & Visual Harmonisation"
   ```

### 2.2 EAS Build Identifiers & Tracking
- **EAS Build ID:** `aaa1988d-bb5f-4b79-920c-01c0413f756a`
- **Build Status:** `in progress`
- **Target Platform:** Android (APK format)
- **Profile:** `preview`
- **Distribution:** `internal`
- **EAS Channel:** `staging`
- **Expo SDK Version:** `58.0.0`
- **Runtime Version:** `1.0.0`
- **Triggered By:** `shinobi04`
- **Started At:** `05/11/2026, 07:26:54`
- **Live Logs URL:** [https://expo.dev/accounts/shinobi04/projects/ay-pizza/builds/aaa1988d-bb5f-4b79-920c-01c0413f756a](https://expo.dev/accounts/shinobi04/projects/ay-pizza/builds/aaa1988d-bb5f-4b79-920c-01c0413f756a)

---

## 3. Security, Safeguards & Environment Audit

- **Android Keystore Preservation:** Remote credentials were confirmed and frozen:
  `√ Using Keystore from configuration: Build Credentials 1OjbQzUxQX (default)`.
  No signing keys or certificates were altered, regenerated, or reset.
- **Environment Isolation:** Loaded staging environment variables:
  `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_APP_ENV`.
- **Git State Integrity:** Zero `git commit` or `git push` commands were issued. The local repository remains strictly on `checkpoint/phase-4-2-3-1`.

