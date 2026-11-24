# ZemiFix Commercial SaaS Target Architecture Blueprint — Final (Approved)

**Date:** November 18, 2026  
**Project Directory:** `E:\HP\Downloads\remix-zemifix-cmms`  
**Reference Specification:** *ZemiFix Architecture Specification v1*, *SaaS Architecture Compatibility Audit*, and *Blueprint V2*  
**Scope:** Final read-only security and operational clarifications for transforming ZemiFix into a commercial SaaS platform, ready for Phase S1 implementation.

---

## 1. PostgreSQL Isolation & Permission Boundaries

To ensure strict multi-tenant isolation within a shared managed PostgreSQL cluster:

### A. Database Permission Boundaries & Role Isolation
- **Dedicated Tenant Database:** Each tenant receives a dedicated PostgreSQL database (`zemifix_tenant_{slug}`).
- **Dedicated Tenant Role:** Each tenant database has a dedicated database role/user (`tenant_user_{slug}`) with zero access to other tenant databases.
- **Revoking `PUBLIC` Privileges:**
  ```sql
  -- Revoke default public connection privileges on the PostgreSQL cluster
  REVOKE CONNECT ON DATABASE zemifix_tenant_{slug} FROM PUBLIC;
  GRANT CONNECT ON DATABASE zemifix_tenant_{slug} TO tenant_user_{slug};
  ```
- **Schema-Level Permissions:**
  - The tenant role is granted full ownership/privileges on the `public` schema within its own database:
    ```sql
    GRANT ALL PRIVILEGES ON SCHEMA public TO tenant_user_{slug};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO tenant_user_{slug};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO tenant_user_{slug};
    ```
- **Elevated Administrative Roles:** Superuser (`postgres`) credentials are never exposed to the application runtime. The application connects exclusively using the tenant-scoped database role (`tenant_user_{slug}`).

### B. Verification of Isolation
- **Automated Isolation Audits:** Periodic automated test routines verify that attempting cross-tenant queries (e.g., executing a query attempting to access another database or ungranted schema) throws a PostgreSQL permission error (`SQLSTATE 42501: insufficient_privilege`).

---

## 2. Secure Administrator Invitations

To securely provision the first Customer Organization Administrator without risk of replay or cross-tenant leakage:

### A. Authoritative Invitation Record
- Stored centrally in the Platform Control Plane database (`AdminInvitation`), securely bound to the specific `TenantId`, `UserId`, and hashed email address.

### B. Cryptographic Specification
- **Token Generation:** 32 bytes of cryptographically secure random entropy (`crypto.randomBytes(32).toString('hex')`).
- **Hashing:** Only the SHA-256 hash of the token is stored in the database (`tokenHash`). The raw token is sent once via email.
- **Expiration & Single-Use:** Inactive after 48 hours. Marked `used = true` immediately upon first validation; subsequent validation attempts are rejected.
- **Tenant Binding:** The token record explicitly encodes the target `tenantId` and `userId`.

### C. Password Setup & Mandatory OTP
1. Administrator clicks the invitation link (`{tenant}.zemifix.com/setup?token=...`).
2. The tenant application validates the token hash against the control plane.
3. Administrator submits a new secure password. The tenant application hashes the password using bcrypt (cost factor 10).
4. The tenant user account is activated (`isActive = true`).
5. The invitation record is invalidated (`used = true`).
6. Mandatory OTP verification is completed before issuing the primary session cookie (`zemifix_session`).

---

## 3. Safe Provisioning Recovery & Destructive Cleanup

To prevent data loss or accidental deletion during asynchronous provisioning failures:

- **No Automatic Drops on Failure:** If a provisioning job fails partway through (e.g., during Prisma migration execution or default seeding), the provisioning engine **must never** automatically drop or delete existing databases or storage directories.
- **Idempotent Retry Lifecycle:** 
  - Provisioning steps are idempotent. A retry checks existing state (e.g., whether the database already exists) and resumes from the exact failing step.
- **Explicit Authorization for Destructive Cleanup:**
  - Deleting or dropping a tenant database or its associated storage bucket requires an **explicit, privileged administrative override action** with dual-confirmation in the control plane dashboard.
- **Protection of Activated Resources:**
  - Once a tenant workspace transitions to `ACTIVE`, any automated provisioning jobs are locked out. Active tenant databases and storage volumes are protected by strict retention and immutable backup locks.

---

## 4. Deployment Isolation & Infrastructure Security

- **Container vs. Hardware Isolation:**
  - Container isolation (e.g., Docker namespaces or ECS tasks) provides process and filesystem isolation on shared physical hosts, but **does not** provide absolute physical hardware isolation (unlike dedicated bare-metal instances).
- **Isolation Layers:**
  - **Application / Container Isolation:** Each tenant runs in its own isolated container instance.
  - **Database Isolation:** Each tenant has an independent PostgreSQL database with dedicated credentials and cluster-level role permissions.
  - **Storage Isolation:** Each tenant uses an isolated storage directory/bucket path (`storage/tenants/{slug}/`).
- **Security Limitations of Shared Physical Infrastructure:**
  - While containerization prevents accidental cross-tenant data access, shared hypervisors/kernels on multi-tenant physical nodes carry theoretical side-channel risks. For standard enterprise tiers, container isolation is fully sufficient; for high-security Enterprise tiers, dedicated node placement or dedicated cluster infrastructure can be provisioned via the control plane.

---

## 5. Infrastructure Decisions & Local Development

### A. Decisions Needed Before Phase S1
- Central platform database schema and control plane authentication.
- Base repository structure for the control plane service.

### B. Decisions Needed Before Production Onboarding
- Production cloud container orchestration provider (AWS ECS, Render, etc.).
- Managed PostgreSQL cluster provider.
- Production DNS wildcard routing and TLS certificate automation.

### C. Local Development Setup (S0 / S1)
- **Local Control Plane:** Runs locally on port 3000 (or 3001) connected to a local platform database (`zemifix_platform_dev`).
- **Local Tenant Workspaces:** Managed locally via local PostgreSQL databases (`zemifix_tenant_dev_1`, `zemifix_tenant_dev_2`) accessed via environment variable mapping during local testing, avoiding the need for production DNS and wildcard SSL during development.

---

## 6. Readiness for S1 Implementation & Remaining Approvals

- **Readiness Status:** The architecture is **fully ready for Phase S1 implementation** (Central Platform Control Plane & Registry).
- **Remaining Decisions Requiring Human Approval:**
  1. Approval of the central platform database schema and control plane code layout.
  2. Approval of the local development execution strategy (port allocation and local database naming conventions).
