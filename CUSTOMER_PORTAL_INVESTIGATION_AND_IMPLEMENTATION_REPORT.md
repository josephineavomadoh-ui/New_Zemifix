# Customer Portal Investigation and Implementation Report

**Date:** November 18, 2026  
**Environment:** `zemifix_dev`  
**Scope:** Stage 2 — Customer Portal Investigation and Complete Implementation  

---

## Executive Summary

This report documents the thorough investigation, verification, and completion of the ZemiFix Customer Portal under `/portal`. The implementation provides external enterprise customers with a secure, isolated, and fully branded self-service workspace to manage maintenance requests, track work orders, view registered equipment assets, inspect service contracts and SLAs, review and approve commercial quotations, view invoices, and manage profile contacts.

---

## 1. Investigation Findings

### Prisma Schema & Data Models
- **Customers & Sites:** The database schema (`customers`, `customer_sites`, `customer_contacts`, `customer_contact_site_grants`) provides robust multi-tenant customer separation.
- **Commercial Records:** `customer_contracts`, `quotes`, `quote_lines`, `quote_decision_logs`, and `invoices` are fully established with Ghana statutory tax schemas (VAT 15%, NHIL 2.5%, GETFund 2.5%).
- **Data Isolation:** Enforced via relational grants and strict server-side checks (`getAuthorizedSiteIdsForContact`).

### Authentication & Sessions
- Customer accounts are maintained in `CustomerContact` tables separate from internal staff `User` accounts.
- Sessions are secured via HMAC-signed JWTs stored in HTTP-only `zemifix_portal_session` cookies with a `zemifix:portal_session` audience.
- Staff privileges and internal administrative APIs remain strictly isolated from customer contacts.

---

## 2. Implemented Customer Portal Routes & APIs

| Route | Type | Description |
| :--- | :--- | :--- |
| `/portal/login` | Page | Secure customer contact login screen. |
| `/portal/dashboard` | Page & API | Service overview, active metrics, recent work orders, and quick navigation. |
| `/portal/requests` | Page & API | Customer maintenance service request intake and tracking. |
| `/portal/work-orders` | Page & API | Active work order live tracking, comments, and attachments. |
| `/portal/assets` | Page & API | Registered equipment assets and status overview. |
| `/portal/contracts` | Page & API | Active service level agreements (SLAs) and contract rate cards. |
| `/portal/quotes` | Page & API | Commercial quotations awaiting customer review. |
| `/portal/quotes/[id]` | Page & API | Itemized quote inspection and atomic Accept/Decline decision action. |
| `/portal/invoices` | Page & API | Issued customer invoices and balance due tracking. |
| `/portal/profile` | Page & API | Contact profile management and customer organization details. |

---

## 3. Server-Side Security & Data Isolation

- **Site-Level Scoping:** Primary contacts or site-granted contacts only receive data matching their authorized `customerId` and `customerSiteId` grants.
- **ID Tampering Protection:** All API endpoints (`/api/portal/*`) re-validate contact permissions on the server. Attempting to access another customer's ID returns 403/404.
- **Idempotent Approvals:** Customer quotation decisions use atomic version checks and `QuoteDecisionLog` entries to prevent duplicate approvals.

---

## 4. Design & Branding

The Customer Portal adopts ZemiFix enterprise branding:
- **Primary Navy:** `#0B1336` / `#080E29`
- **Brand Orange:** `#FF5B00`
- **Background:** `#F8FAFC` with clean white cards and `#E2E8F0` borders.
- Fully responsive desktop and mobile layouts with loading skeletons and empty states.

---

## 5. Automated Test Results

- **QR & Workflow Integration Tests:** All QR request acceptance and commercial lifecycle workflow tests passed successfully (`vitest`).
- **Authorization & Isolation Tests:** Verified that cross-customer record access is securely rejected on the server.

---

## 6. Conclusion

The ZemiFix Customer Portal is fully implemented, secure, isolated, and verified against all enterprise specifications.
