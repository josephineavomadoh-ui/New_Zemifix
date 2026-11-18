# ZemiFix CMMS — OTP Delivery Failure Investigation & Resolution Report

**Date of Investigation**: November 17, 2026  
**Environment**: Development (`zemifix_dev`)  
**Reported Symptom**: `Failed to deliver authentication code. Please try again or contact support.` (HTTP 502) when attempting to sign in with a newly created Admin or staff account.  
**Resolution Status**: **RESOLVED** (100% Verified)

---

## 1. Root Cause Analysis

### Traced OTP Workflow
1. User submits email and password to `POST /api/auth/login`.
2. Password hash is verified via bcrypt (`verifyPassword`).
3. OTP challenge record is created in PostgreSQL (`createOtpChallenge`) with a 6-digit cryptographically secure code.
4. Login API calls `dispatchOtp(destination, 'EMAIL', plainCode)` in `src/lib/services/deliveryService.ts`.
5. `sendEmailOtp()` initializes Resend client with `RESEND_API_KEY` and sender address `OTP_FROM_EMAIL="ZemiFix Security <onboarding@resend.dev>"`.
6. Resend API receives the request to deliver an email to `newadmin@zemifix.local`.

### Exact Failure Mechanism
- The `RESEND_API_KEY` configured in `.env` uses Resend's free testing sandbox domain (`onboarding@resend.dev`).
- Under Resend's security policies, testing accounts using `onboarding@resend.dev` are **strictly prohibited** from sending emails to unverified third-party domains (such as `@zemifix.local` or unverified external addresses).
- When `dispatchOtp()` attempted to send to `newadmin@zemifix.local`, Resend API returned the following rejection response:
  ```json
  {
    "ok": false,
    "detail": "Resend error: validation_error — You can only send testing emails to your own email address (josephineavomadoh@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains, and change the `from` address to an email using this domain."
  }
  ```
- In `.env`, the developer recipient override line `# OTP_TEST_OVERRIDE_RECIPIENT="josephineavomadoh@gmail.com"` was commented out.
- Consequently, `sendEmailOtp()` attempted direct delivery to `@zemifix.local`, triggering Resend's `validation_error` and causing `POST /api/auth/login` to fail with HTTP 502.

---

## 2. Configuration & Security Audit

| Configuration Variable | Value in `.env` | Provider Policy Status |
| :--- | :--- | :--- |
| `RESEND_API_KEY` | `re_EXc5NK7...` | Valid Resend API Key |
| `OTP_FROM_EMAIL` | `ZemiFix Security <onboarding@resend.dev>` | Resend Sandbox Default Domain |
| `OTP_TEST_OVERRIDE_RECIPIENT` | `josephineavomadoh@gmail.com` | **Uncommented to enable dev delivery override** |
| `NODE_ENV` | `development` | Non-production environment |

### Security Safeguards
- **Production Guard**: `deliveryService.ts` enforces a safety check: if `NODE_ENV === 'production'` and `OTP_TEST_OVERRIDE_RECIPIENT` is set, `sendEmailOtp()` immediately fails to prevent accidental test redirects in production.
- **Mandatory OTP & Rate Limiting**: All password verification, HMAC-SHA256 OTP hashing, 5-minute expiration, and rate-limiting rules remain 100% active and un-bypassed.

---

## 3. Corrections Made

1. **Environment Configuration Update (`.env`)**:
   Uncommented `OTP_TEST_OVERRIDE_RECIPIENT="josephineavomadoh@gmail.com"` in `.env`.
   In non-production development environments, this routes all outbound test OTP emails (for `admin@zemifix.local`, newly created admins, or technicians) to the verified account owner (`josephineavomadoh@gmail.com`), satisfying Resend sandbox policy.

---

## 4. Test Execution & Verification Results

Created and executed a test suite verifying the complete login, challenge, delivery, and OTP verification lifecycle for a newly created Admin account (`newadmin.<ts>@zemifix.local`):

```
=====================================================
Testing Full Login & OTP Authentication Workflow
=====================================================

1. Creating new Admin account: newadmin.1794961619793@zemifix.local...
[PASS] User created with ID: 01a1ec0c-be8e-7ba5-b4ab-cf2118ac133e

2. Verifying password hash...
[PASS] Password verification result: true

3. Creating OTP Challenge...
[PASS] OTP Challenge created. Record ID: 01a1ec0c-bf8a-78d6-95b2-275cb6e0888e

4. Dispatching OTP...
[PASS] OTP Delivery Result: { ok: true }

5. Verifying OTP Code...
[PASS] OTP Verification Result: { status: 'valid' }

6. Generating authenticated session token...
[PASS] Session token generated successfully.

[PASS] Test user cleaned up successfully.

=====================================================
FULL LOGIN & OTP WORKFLOW VERIFIED SUCCESSFULLY!
=====================================================
```

---

## 5. Production Domain Setup Instructions

When deploying ZemiFix CMMS to production:
1. Register and verify your custom domain at [resend.com/domains](https://resend.com/domains).
2. Set `OTP_FROM_EMAIL="ZemiFix Security <no-reply@yourdomain.com>"` in `.env`.
3. Unset or remove `OTP_TEST_OVERRIDE_RECIPIENT` from `.env`.
