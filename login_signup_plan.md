# Final Implementation Plan: Parental Authentication & Protected Session

## Overview

SurakshaNet is installed by parents to protect their children from toxic/abusive content on social media (WhatsApp Web, Twitter/X, Instagram). To ensure children cannot disable protection, tamper with evidence, or log out of the extension, we are implementing a **Parental Master Password & Protected Session Architecture** using **Strategy 1 (Hybrid Sync)**.

---

## Key Architecture & State Model

                    ┌─────────────────────────┐

                    │ Extension First Install │

                    └────────────┬────────────┘

                                 │

                                 ▼

                     \[ State 1: UNCONFIGURED \]

         Popup shows "Setup Required" ──► Launches Setup Wizard (auth.html)

                                 │ (Parent sets Email \+ Master Password)

                                 ▼

               \[ State 2: CHILD PROTECTION (LOCKED) \]

   • AI scanning actively protects WhatsApp, Twitter/X, Instagram 24/7

   • Popup shows "🛡️ SurakshaNet Active & Protecting"

   • Evidence logs, PDF exports, and logout controls are LOCKED

                                 │

                 (Parent enters Master Password)

                                 ▼

                 \[ State 3: PARENT MODE (UNLOCKED) \]

   • View full incident logs, categories & DOM screenshots

   • Export Court-Admissible PDF & JSON reports

   • "🔒 Lock Session" button (reverts to Child Mode)

   • "🚪 Logout / Reset Account" (guarded by Master Password confirmation)

---

## User Review Required

> \[\!IMPORTANT\] **Summary of Finalized Decisions:**  
> 

> 1. **Authentication Scope**: Strictly Parent Email & Master Password (no PIN, no security questions, no child profile name).  
> 2. **Storage Architecture (Strategy 1 \- Hybrid Sync)**:  
>    - `chrome.storage.sync`: Account profile (Email \+ `PBKDF2-HMAC-SHA256` password hash \+ 16-byte random salt). Survives local cache clearing and syncs across the parent's Chrome profile.  
>    - `chrome.storage.local`: Large incident evidence logs, SHA-256 hashes, and DOM screenshots (ensures 100% on-device privacy).  
> 3. **First-Run Onboarding**: Opens `src/auth/auth.html` on first install. If popup is opened prior to setup, it shows an "Unconfigured" state with a button to launch the setup wizard.  
> 4. **Child-Proof Logout**: Resetting or logging out of the extension strictly requires master password verification.

---

## Proposed Changes

### 1\. Authentication Core

#### \[NEW\] [auth\_manager.js](file:///Users/aamodjain/Desktop/SurakshaNet/surkashanet/src/utils/auth_manager.js)

- **PBKDF2-HMAC-SHA256 Key Derivation**:  
  - Generates cryptographically secure 16-byte random salt.  
  - Derives 256-bit key with 100,000 iterations using Web Crypto API (`crypto.subtle`).  
- **Account & Session APIs**:  
  - `isAccountSetup()`: Checks `chrome.storage.sync` (with local fallback) to verify if an account exists.  
  - `setupParentAccount({ email, password })`: Salts & hashes password, saves credentials to `chrome.storage.sync`.  
  - `verifyParentPassword(password)`: Verifies candidate password against stored salted hash.  
  - `loginParent(password)`: Verifies password and activates the session in `chrome.storage.session` / memory.  
  - `isParentSessionActive()`: Returns boolean indicating if parent mode is currently unlocked.  
  - `lockSession()`: Clears active session and locks the extension back into Child Protection mode.  
  - `logoutParent(confirmPassword)`: Re-verifies master password before clearing account and resetting state.

---

### 2\. Dedicated Setup & Auth Portal (Full Page)

#### \[NEW\] [auth.html](file:///Users/aamodjain/Desktop/SurakshaNet/surkashanet/src/auth/auth.html)

- Full-page responsive interface styled with SurakshaNet’s cyber-defense theme:  
  - **Setup / Sign Up Tab**:  
    - Parent Email input  
    - Master Password (with strength indicator) & Confirm Password input  
    - Parental notice explaining the 24/7 background AI protection  
    - "Activate Parental Protection" action button  
  - **Login Tab**:  
    - Master Password entry to unlock parent portal  
- Clean feedback toasts for validation, errors, and success.

#### \[NEW\] [auth.js](file:///Users/aamodjain/Desktop/SurakshaNet/surkashanet/src/auth/auth.js)

- Handles form submission, password matching, validation, calls `auth_manager.js`, and redirects/closes upon activation.

---

### 3\. Extension Popup Redesign (State-Aware)

#### \[MODIFY\] [evidence\_viewer.html](file:///Users/aamodjain/Desktop/SurakshaNet/surkashanet/src/popup/evidence_viewer.html)

- Dynamically renders 3 distinct view states:  
  1. **View 1: Unconfigured State**:  
     - Friendly banner: *"SurakshaNet is not configured yet."*  
     - Button: *"🚀 Launch Parent Setup Wizard"* (opens `auth.html`).  
  2. **View 2: Child Protection State (Default / Locked)**:  
     - Prominent status: *"🛡️ SurakshaNet Active — Real-time Protection Enabled"*.  
     - Protected channels indicator: WhatsApp Web, Twitter/X, Instagram.  
     - Section: *"Parent Portal Access"* with password input and *"Unlock Dashboard"* button.  
     - Evidence list, stats, PDF export, and clear buttons are completely hidden from the child.  
  3. **View 3: Parent Mode (Unlocked Dashboard)**:  
     - Header bar with *"👨‍👩‍👧 Parent Mode Active"* and *"🔒 Lock Session"* button.  
     - Full evidence statistics, incident logs, screenshots, and export tools (PDF/JSON).  
     - Footer *"Logout / Reset"* button protected by password prompt.

#### \[MODIFY\] [evidence\_viewer.js](file:///Users/aamodjain/Desktop/SurakshaNet/surkashanet/src/popup/evidence_viewer.js)

- Orchestrates view transitions based on `isAccountSetup()` and `isParentSessionActive()`.  
- Binds password unlock submission and error shaking/feedback.  
- Binds "Lock Session" and password-verified "Logout".

---

### 4\. Background Service Worker

#### \[MODIFY\] [service-worker.js](file:///Users/aamodjain/Desktop/SurakshaNet/surkashanet/src/background/service-worker.js)

- On `chrome.runtime.onInstalled`:  
  - If `isAccountSetup()` is false, automatically opens `src/auth/auth.html` in a new tab.  
- Ensures AI toxicity scanning on content scripts continues 24/7 in the background regardless of locked/unlocked state.

---

### 5\. Build Configuration & Manifest

#### \[MODIFY\] [manifest.json](file:///Users/aamodjain/Desktop/SurakshaNet/surkashanet/manifest.json)

- Add `"options_page": "src/auth/auth.html"` and ensure `src/auth/auth.html` is accessible.

#### \[MODIFY\] [vite.config.js](file:///Users/aamodjain/Desktop/SurakshaNet/surkashanet/vite.config.js)

- Update Vite/Rollup config to include `src/auth/auth.html` as an entry point for building into `dist/`.

---

## Verification Plan

### Automated / Build Verification

- Execute `npm run build` to verify Vite and CRXJS bundle all HTML entry points (`evidence_viewer.html`, `auth.html`), scripts, and assets without errors.

### Manual Verification

1. **First-Time Install**:  
   - Load unpacked extension into Chrome.  
   - Verify `auth.html` automatically opens in a new tab.  
   - Verify that clicking the extension icon prior to completing setup shows the "Setup Required" state with a button to launch the wizard.  
2. **Account Creation**:  
   - Complete signup in `auth.html` with Parent Email and Master Password.  
   - Verify salted PBKDF2 hash is stored in `chrome.storage.sync`.  
3. **Child Mode (Locked)**:  
   - Open popup: Confirm "🛡️ SurakshaNet Active Protection" is displayed and evidence logs / PDF exports / settings are hidden.  
   - Confirm there is no way for a child to log out or bypass monitoring.  
4. **Parent Mode (Unlock & Lock)**:  
   - Enter master password to unlock popup.  
   - Verify all evidence records, statistics, and PDF export work properly.  
   - Click "Lock Session" and verify popup immediately returns to Child Mode.  
5. **Parent Logout / Reset**:  
   - Attempt logout and verify it requires master password confirmation before clearing credentials.  
6. **Continuous Protection**:  
   - Verify DOM scanner and background ONNX model detect toxic content and log evidence regardless of whether popup is locked or unlocked.
