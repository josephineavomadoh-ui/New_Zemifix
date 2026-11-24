# ZemiFix Performance Phase P2.1: Implementation Blueprint

**Date:** November 18, 2026  
**Project Directory:** `E:/HP/Downloads/remix-zemifix-cmms`  
**Framework:** Next.js 15, React 19, Prisma 6, PostgreSQL  
**Scope:** Detailed, evidence-based implementation blueprint for Database Query Optimization (Phase P2.1). (Design and planning phase only; zero code changes executed).

---

## 1. Executive Summary

Building upon Phase P1 (Authentication and Session Validation Optimization), Phase P2.1 establishes a rigorous implementation blueprint for database query optimization across ZemiFix CMMS. Through source-code verification, we have analyzed Prisma query patterns, relational inclusions, indexing requirements, pagination strategies, and financial ledger safety. The blueprint defines staged implementation tasks (P2.2 through P2.5) to enhance navigation and data loading performance while strictly preserving multi-tenant isolation, branch access scopes, RBAC permissions, and financial transaction integrity.

---

## 2. Verified Source-Code Findings

- **Dashboard Concurrency:** Verified via source-code inspection of `src/lib/services/dashboardService.ts` that `getDashboardMetrics()` already aggregates 19 independent statistical queries concurrently via `Promise.all()`.
- **Unbounded List Retrieval:** Several services (`workOrderService.ts`, `assetService.ts`, `billingService.ts`) perform `prisma.*.findMany()` without default pagination parameters (`take` / `skip`), risking heavy payload serialization and execution latency on large enterprise datasets.
- **Deep Relational Inclusions:** Certain queries include expansive multi-level relations (`tasks`, `checklists`, `labor`, `parts`, `attachments`, `statusHistory`) even when consumers only require summary metadata.

---

## 3. Exact File and Function Inventory

| Service / Module | Exact File Path | Key Functions | Identified Optimization Target |
| :--- | :--- | :--- | :--- |
| **Dashboard** | `src/lib/services/dashboardService.ts` | `getDashboardMetrics()` | Already parallelized via `Promise.all()` |
| **Work Orders** | `src/lib/services/workOrderService.ts` | `getWorkOrders()` | Add default pagination (`take: 50`) & selective projection |
| **Assets** | `src/lib/services/assetService.ts` | `getAssets()` | Add default pagination (`take: 50`) & selective projection |
| **Billing & Finance** | `src/lib/services/billingService.ts` | `getInvoices()`, `getPayments()` | Add default pagination (`take: 50`) |
| **Procurement** | `src/lib/services/procurementService.ts` | `getPurchaseOrders()`, `getRequisitions()` | Add default pagination (`take: 50`) |
| **Audit Service** | `src/lib/services/auditService.ts` | `getAuditLogs()` | Add cursor-based pagination |

---

## 4. Dashboard Optimization Plan

- **Finding:** `dashboardService.ts` already implements concurrent batch execution via `Promise.all()`.
- **Recommendation:** Retain existing parallel execution structure and ensure short-TTL in-memory caching or Redis caching is evaluated for non-sensitive summary metrics in future high-scale deployments.

---

## 5. Pagination Compatibility Plan

- **Default Page Size:** 50 records per page.
- **Maximum Page Size:** 200 records per page.
- **Strategy:**
  - Offset pagination (`skip` / `take`) for administrative table views.
  - Cursor-based pagination (`cursor` / `take`) for high-throughput append-only logs (Stock Transactions, Audit Logs).
- **Security Prerequisite:** Branch authorization (`getScopedWorkOrderFilter`, `getScopedAssetFilter`) and customer site authorization must execute *before* pagination parameters are applied.

---

## 6. Index Verification and Migration Plan

Proposed PostgreSQL indexes to support high-frequency filtering:
1. **`work_orders`**: `(branchId, status, createdAt)`
2. **`assets`**: `(managingBranchId, status)`
3. **`stock_transactions`**: `(storeId, partId, createdAt)`
4. **`audit_logs`**: `(resource, resourceId, createdAt)`
5. **`invoices`**: `(customerId, status, dueDate)`

---

## 7. Selective Projection and N+1 Plan

- Replace blanket `include` statements in list views with targeted `select` statements returning only identifier, code, status, priority, and date fields.
- Preserve full `include` statements exclusively on detail views (`[id]/page.tsx` and detail API routes).

---

## 8. Financial & Inventory Integrity Safeguards

- **Strict Isolation:** All inventory issues, receipts, transfers, WAC calculations, invoice totals, and payment allocations remain bound inside Prisma interactive transactions (`prisma.$transaction`) with strict decimal precision (`Prisma.Decimal`).
- **Immutability:** Append-only financial ledger history and maker-checker approval controls are never compromised or bypassed.

---

## 9. Security & Authorization Safeguards

- Tenant isolation (`customerId`), company scoping, branch access hierarchies (`branchPath`), and customer site grants (`CustomerContactSiteGrant`) are evaluated before any query execution or pagination.

---

## 10. Benchmarking Methodology

- Measure query execution duration (ms), Prisma query counts per page, API response times, and payload sizes across representative data volumes before and after applying pagination and selective projection.

---

## 11. Staged Implementation Roadmap

- **Stage P2.2:** Apply default pagination (`take: 50`) and selective projection (`select`) to Work Order list services.
- **Stage P2.3:** Apply pagination and select projection to Asset and Inventory list services.
- **Stage P2.4:** Apply pagination and select projection to Billing, Finance, and Procurement services.
- **Stage P2.5:** Create and apply verified PostgreSQL composite indexes.

---

## 12. Outstanding Risks & Decisions Requiring Approval

- **Migration Execution Approval:** Approval required before creating and applying database index migrations in `prisma/migrations/`.
- **Client Cache Synchronization:** Ensuring frontend list pagination components correctly handle pagination metadata (`page`, `pageSize`, `totalCount`).
