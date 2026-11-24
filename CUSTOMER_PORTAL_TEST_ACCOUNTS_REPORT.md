# Customer Portal Test Accounts Investigation Report

**Date:** November 18, 2026  
**Project Directory:** `E:\HP\Downloads\remix-zemifix-cmms`  
**Database:** `zemifix_dev` (Read-Only Investigation)  
**Scope:** Investigation and identification of existing customer accounts, contact identities, login credentials status, site authorizations, and invoice availability for testing the Customer Portal and Phase R2 invoice PDF download functionality.

---

## 1. Executive Summary

This report documents the read-only investigation of existing customer accounts in the `zemifix_dev` database. The database currently contains test customer organization records (such as `QR Test Customer Ltd`) created during automated test suites, but lacks pre-seeded `CustomerContact` users or issued commercial invoices. This report provides clear instructions on how to set up or verify test customer accounts and activate Phase R2 invoice testing without violating data safety guardrails.

---

## 2. Customer Account Inventory

| Customer Organization Name | Customer Number | Contact Name | Login Email | Phone | Account Status | Authorized Sites | Invoice Availability |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **QR Test Customer Ltd** | `CUST-QR-9421` | *None configured* | *None configured* | `0244000000` | Active Organization | 144 Sites (`STE-QR-*`) | None (Zero invoices issued in dev baseline) |

---

## 3. Authentication & Login Mechanism

- **Authentication Route:** `/portal/login`
- **API Endpoint:** `/api/portal/auth/login`
- **Session Cookie:** `zemifix_portal_session` (HMAC-signed JWT with `zemifix:portal_session` audience, valid for 24 hours).
- **Credentials Requirement:** Customer portal access requires an active `CustomerContact` record with a valid bcrypt `passwordHash` linked to the target `Customer` organization.

---

## 4. Activation & Testing Recommendations for Phase R2

Because the test database (`zemifix_dev`) currently contains enterprise customer shells without active portal contacts or commercial invoices:

1. **Creating a Test Customer Contact (Read-Only DB Note / Setup):**
   - An authorized contact can be provisioned in `CustomerContact` linked to `CUST-QR-9421` with an active status (`isActive = true`), `isPrimaryContact = true`, and permissions (`canViewFinancials = true`).
2. **Generating a Test Invoice for Phase R2 Verification:**
   - A commercial invoice can be created via staff management views or billing service functions (`createInvoice`) tied to `CUST-QR-9421` and one of its sites (`STE-QR-902928`), populating itemized lines and Ghana statutory taxes (VAT 15%, NHIL 2.5%, GETFund 2.5%).
3. **Recommended Test Flow:**
   - Log in using the test customer contact at `/portal/login`.
   - Navigate to `/portal/invoices`.
   - Click **"View / Download PDF"** on the test invoice to verify Phase R2 HTML/PDF generation and print layout.
