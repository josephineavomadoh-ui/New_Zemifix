# ZemiFix Platform Migration History & Architecture Investigation

**Date:** November 18, 2026  
**Project Directory:** `E:/HP/Downloads/remix-zemifix-cmms`  
**Scope:** Read-only investigation of Prisma migration files, database migration history in `zemifix_platform_dev`, and architectural correction plan.

---

## 1. Inspection of Migration Files & Directories

- **Tenant Schema File:** `prisma/schema.prisma`
- **Platform Schema File:** `prisma/platform.prisma`
- **Shared Migration Directory:** `prisma/migrations/` (containing 33 tenant migration subfolders ranging from `20261105111818_init` to `20261118000002_add_work_order_maintenance_plan_column`).
- **Findings:**
  - There are zero platform-specific migration files or subfolders inside `prisma/migrations/`.
  - An isolated `init_platform` SQL migration file does not exist on disk as a standalone migration folder.
  - **Critical Finding:** Because `prisma/platform.prisma` did not specify a dedicated migration directory, Prisma defaulted to `prisma/migrations/`. Consequently, applying migrations to `zemifix_platform_dev` caused it to execute all 33 tenant CMMS migrations instead of creating the 10 control plane platform tables (`platform_users`, `tenants`, `tenant_deployments`, etc.).

---

## 2. Platform Database Migration History Inspection

- **Connected Database:** `zemifix_platform_dev` (Confirmed via `SELECT current_database()`).
- **`_prisma_migrations` Records:** The database history table contains all 33 tenant CMMS migration records (`20261105111818_init` through `20261118000002_add_work_order_maintenance_plan_column`).
- **Tables Created in `zemifix_platform_dev`:** The database currently holds the 60+ tenant operational tables (such as `companies`, `users`, `assets`, `work_orders`, `invoices`) rather than the 10 platform control plane models defined in `prisma/platform.prisma`.

---

## 3. Recommended Safe Correction Architecture

To achieve absolute physical separation of platform and tenant migration histories, clients, and schemas:

1. **Dedicated Platform Schema & Migration Directory Structure:**
   - Move platform schema and migrations to an isolated directory structure:
     - Schema: `prisma/platform/platform.prisma` (or retain `prisma/platform.prisma`)
     - Migrations: `prisma/platform/migrations/`
   - *Note:* In Prisma, ensuring separate migration histories requires maintaining migrations in a dedicated folder or repository.
2. **Preserving and Re-initializing the Platform Database:**
   - Since `zemifix_platform_dev` is a local development database (`zemifix_platform_dev`) with zero production data, the correct remediation path is to drop/re-create `zemifix_platform_dev` cleanly, configure a dedicated platform migration directory, and run the initial platform migration (`init_platform`) so that only the 10 control plane tables are created.

---

## 4. Final Verdict: SAFE AFTER CORRECTION

- **Verdict:** **SAFE AFTER CORRECTION**
- **Summary:** The current shared migration folder caused tenant migrations to be applied to the platform database. Implementing the recommended dedicated platform migration directory structure (`prisma/platform/migrations/`) fully resolves this architectural overlap without impacting tenant databases or existing application code.
