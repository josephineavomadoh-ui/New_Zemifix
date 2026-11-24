# ZemiFix SaaS Architecture Compatibility Audit

**Date:** November 18, 2026  
**Project Directory:** `E:\HP\Downloads\remix-zemifix-cmms`  
**Reference Specification:** *ZemiFix Architecture Specification v1* (Dated November 4, 2026)  
**Scope:** Read-only architectural assessment of ZemiFix prior to implementing multi-tenant company onboarding and customer workspace provisioning.

---

## 1. Original Architecture Summary

According to the *ZemiFix Architecture Specification v1*, ZemiFix is designed as a commercial Computerized Maintenance Management System (CMMS) product for multiple independent organizations (hospitals, hotels, manufacturing, schools, facilities management, and maintenance contractors). 

Key architectural tenets include:
- **Deployment Isolation:** One legal company per deployment, backed by a single `Company` record. No shared multi-company tenant tables inside a single database deployment. Separate isolated deployments per customer organization.
- **Central Fleet / Platform Management:** A platform-level capability to oversee subscriptions, billing, licenses, and deployment provisioning.
- **Data Isolation:** Complete data separation between independent company workspaces.

---

## 2. Actual Current Implementation

- **Single-Tenant Core:** The existing codebase operates on a single-deployment model where the database contains one `Company` record, a single branch tree, department tree, user pool, asset register, and work management tables.
- **Facility & Contractor Modes:** Operational modes (`facility: true`, `contractor: true`) are stored as JSON configuration on the singleton `Company` record (`prisma/schema.prisma`).
- **Customer Portal (`/portal`):** Implemented for external commercial clients of a contractor company, allowing them to view work orders, assets, contracts, quotations, and invoices restricted by site grants.

---

## 3. Existing Company and User Architecture

- **Company Model (`Company`):** Represents the singleton organization per deployment, storing currency, timezone, locale, tax schemes, operational modes, and number sequence prefixes.
- **User Model (`User`):** Represents internal employees, technicians, planners, and administrators. Tied to a `branchId`, `departmentId`, and `roleId`, governed by `accessScope` (`Company`, `BranchAndBelow`, `Branch`, `Department`, `Own`).
- **Customer Contact Model (`CustomerContact`):** Represents external customer personnel accessing the portal, strictly isolated from staff `User` accounts.

---

## 4. Identity Separation Assessment

The specification establishes three distinct identities which are currently structured as follows:

1. **ZemiFix Platform Administrator:**
   - *Status:* **Missing / Unimplemented**. Currently, the platform has no concept of a super-admin or platform billing/subscription layer across multiple tenant deployments.
2. **Customer Organization Administrator:**
   - *Status:* **Partially Implemented**. Represented by the initial Admin user seeded via `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`, having full access to branch configuration, users, and organization settings.
3. **Contractor Customer Portal Contact:**
   - *Status:* **Fully Implemented**. Managed via `CustomerContact` tables with JWT cookies (`zemifix_portal_session`), completely separated from internal staff.

---

## 5. Deployment Isolation Assessment

- The current implementation enforces isolation *within a single deployment* using branch/department scopes and customer site grants (`CustomerContactSiteGrant`).
- Moving toward a multi-organization SaaS product requires formalizing the transition from single-deployment codebases to isolated deployments (or containerized tenant provisioning) orchestrated by a central control plane.

---

## 6. Company Onboarding Gaps

To achieve automated company onboarding (Organization registers $\rightarrow$ supplies company info $\rightarrow$ selects Facility/Contractor mode $\rightarrow$ workspace provisioned $\rightarrow$ database & storage allocated $\rightarrow$ initial provisioning $\rightarrow$ admin invitation $\rightarrow$ OTP verification $\rightarrow$ workspace login), the following components are missing:
1. **SaaS Control Plane / Platform Registry:** A central tenant registry tracking registered organizations, subscription tiers, and deployment endpoint URLs.
2. **Automated Tenant Provisioning Pipeline:** Scripted or automated routines to spin up isolated database instances (or isolated schemas/databases) and seed base organization defaults.
3. **Admin Invitation & Provisioning Workflow:** Secure onboarding token generation, email invitation delivery via Resend, and first-time admin password/OTP setup.

---

## 7. Subscription and Licensing Gaps

- There are currently no database models or services for tracking software licenses, subscription plans (Free, Professional, Enterprise), billing cycles, or seat counts.

---

## 8. Provisioning Gaps

- Automated schema migration execution and storage volume provisioning per tenant are currently manual developer tasks (`prisma migrate dev`, `seed.ts`).

---

## 9. Customer Portal Relationship

- The existing Customer Portal (`/portal`) correctly belongs to Category C (external customers of a contractor organization). It must remain separate from company administrator workspaces and subscriber organization management.

---

## 10. Security Risks

- **Tenant Bleed Risk:** If multi-tenancy were improperly introduced via shared database tables without strict isolation, cross-company data leakage would occur. Preserving the "one company per deployment" rule mitigates this risk.
- **Admin Provisioning Security:** Onboarding invitations must enforce time-limited cryptographic tokens and mandatory OTP verification to prevent unauthorized account takeover during setup.

---

## 11. Recommended Target Architecture

- Retain the **"One Legal Company per Deployment"** architectural decision.
- Implement a **Central Platform Management / Provisioning Control Plane** that manages customer subscriptions and provisions isolated container/database instances for each subscribing organization.
- Maintain strict identity boundaries between Platform Admins, Customer Org Admins, and Customer Portal Contacts.

---

## 12. Phased Implementation Roadmap

- **Phase S1:** SaaS Platform Control Plane & Subscription Registry.
- **Phase S2:** Automated Tenant Database & Storage Provisioning Pipeline.
- **Phase S3:** Organization Registration & First-Admin Invitation Flow.
- **Phase S4:** Platform Administration & Tenant Health Monitoring.

---

## 13. Database Changes That May Eventually Be Required

- **Central Platform Database:** A separate master database for tracking tenants, subscriptions, billing, and system admin accounts.
- **Tenant Databases:** Independent PostgreSQL databases per tenant organization (preserving the zero-shared-data tenant isolation model).

---

## 14. Deployment and Hosting Requirements

- Containerized deployments (Docker/Kubernetes or PaaS instances) with dynamic database URL binding (`DATABASE_URL`) per tenant workspace.
- Centralized reverse proxy or gateway routing tenant subdomains (`tenant.zemifix.com`) to their respective container/deployment instances.
