# ZemiFix CMMS — Individual OTP Delivery & Dev Fallback Report

**Date**: November 17, 2026  
**Environment**: Development (`zemifix_dev`)  
**Objective**: Enable individual OTP delivery per user account, remove global single-email redirection, and handle Resend sandbox domain restrictions gracefully without blocking development authentication.  
**Resolution Status**: **COMPLETED & VERIFIED**

---

## 1. Investigation Findings

### Resend Sandbox Restrictions Explained
- The Resend API key configured in `.env` uses Resend's free default sandbox sender domain: `ZemiFix Security <onboarding@resend.dev>`.
- Under Resend's sandbox security policies, free accounts using `onboarding@resend.dev` are **strictly restricted** to delivering emails exclusively to the verified account owner's email address (`josephineavomadoh@gmail.com`).
- Attempting to deliver emails to non-owner addresses (such as `admin@zemifix.local`, `gyamfigloriananayaa@gmail.com`, or any staff member with an unverified address) triggers Resend API error:
  `Resend error: validation_error — You can only send testing emails to your own email address (josephineavomadoh@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains...`
- Previously, configuring `OTP_TEST_OVERRIDE_RECIPIENT="josephineavomadoh@gmail.com"` forced ALL user OTPs to redirect to a single email address, preventing other admins and staff members from receiving their own authentication challenges.

---

## 2. Individual Delivery & Dev Fallback Architecture

### A. Removal of Global Single-Recipient Redirection
- Removed/commented out `OTP_TEST_OVERRIDE_RECIPIENT` in `.env`.
- `sendEmailOtp()` in `src/lib/services/deliveryService.ts` now dispatches OTP challenges directly to each user's own registered email address (`to`).

### B. Graceful Non-Production Sandbox Fallback
- When a verified account owner (`josephineavomadoh@gmail.com`) logs in, Resend API delivers a real email directly to their inbox.
- When an Admin or staff member with a local or unverified address (`admin@zemifix.local`, `gyamfigloriananayaa@gmail.com`, etc.) logs in:
  - `sendEmailOtp()` attempts delivery via Resend API.
  - If Resend returns a sandbox domain restriction error (`validation_error` / `testing emails`), `sendEmailOtp()` checks `NODE_ENV !== 'production'`.
  - In development mode, `sendEmailOtp()` catches the sandbox error and outputs a prominent server console log:
    ```
    [deliveryService] DEV MOCK FALLBACK — Could not send via Resend sandbox to "admin@zemifix.local". [Dev OTP Code: 654321]. To receive real emails for admin@zemifix.local, verify your custom domain at resend.com/domains.
    ```
  - Returns `{ ok: true }` so the user is not blocked by HTTP 502 errors and can enter the code output in the server logs to complete sign-in.
- **Production Isolation**: In production (`NODE_ENV === 'production'`), dev mock fallback is strictly disabled; emails must pass verified custom domain delivery.

---

## 3. Security Controls Preserved

- **Mandatory OTP MFA**: Multi-factor authentication remains required for all staff sign-ins.
- **Security Integrity**: Password hash verification (bcrypt), HMAC-SHA256 OTP code hashing, 5-minute expiration, 5-attempt limit, and 8-hour session lifetime rules remain 100% active.
- **No Credentials Exposed**: API responses return masked destinations (e.g. `ad***@zemifix.local`) without leaking plain codes or provider credentials to client browsers.

---

## 4. Files Modified

| File Path | Action | Description |
| :--- | :--- | :--- |
| `.env` | `MODIFIED` | Commented out `OTP_TEST_OVERRIDE_RECIPIENT` to enable individual email routing |
| `src/lib/services/deliveryService.ts` | `MODIFIED` | Updated `sendEmailOtp()` to handle Resend sandbox restrictions in dev mode via console fallback |
| `OTP_INDIVIDUAL_DELIVERY_REPORT.md` | `NEW` | Individual delivery implementation report |

---

## 5. Test Execution & Verification Results

Executed individual delivery test across multiple account types:

```
=====================================================
Testing Individual OTP Delivery & Dev Fallback Engine
=====================================================

Testing delivery to: josephineavomadoh@gmail.com (Josephine - Account Owner)...
Delivery Result: { ok: true }
[PASS] Delivery succeeded (Real Email Delivered via Resend)

Testing delivery to: gyamfigloriananayaa@gmail.com (Gloria - Staff Email)...
[deliveryService] DEV MOCK FALLBACK — Could not send via Resend sandbox to "gyamfigloriananayaa@gmail.com". [Dev OTP Code: 654321]...
Delivery Result: { ok: true }
[PASS] Delivery succeeded (Dev Mock Fallback)

Testing delivery to: admin@zemifix.local (Admin - Local Dev Email)...
[deliveryService] DEV MOCK FALLBACK — Could not send via Resend sandbox to "admin@zemifix.local". [Dev OTP Code: 654321]...
Delivery Result: { ok: true }
[PASS] Delivery succeeded (Dev Mock Fallback)

Testing delivery to: newadmin.test@zemifix.local (New Admin - Local Dev Email)...
[deliveryService] DEV MOCK FALLBACK — Could not send via Resend sandbox to "newadmin.test@zemifix.local". [Dev OTP Code: 654321]...
Delivery Result: { ok: true }
[PASS] Delivery succeeded (Dev Mock Fallback)

=====================================================
TESTING COMPLETE — ALL INDIVIDUAL RECIPIENTS HANDLED
=====================================================
```

---

## 6. How to Enable Real Emails for All Domains in Production

To deliver real emails to all domain names in production:
1. Register your custom domain at [resend.com/domains](https://resend.com/domains).
2. Add DNS records (MX, TXT, CNAME) as instructed by Resend.
3. Update `.env`: `OTP_FROM_EMAIL="ZemiFix Security <no-reply@yourdomain.com>"`.
