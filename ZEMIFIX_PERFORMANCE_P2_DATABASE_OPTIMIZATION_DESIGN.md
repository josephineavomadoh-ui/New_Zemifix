# ZemiFix Performance Phase P2: Database Query Optimization Technical Design

**Date:** November 18, 2026  
**Project Directory:** `E:/HP/Downloads/remix-zemifix-cmms`  
**Framework:** Next.js 15, React 19, Prisma 6, PostgreSQL  
**Scope:** Comprehensive database query optimization strategy, pagination design, missing index identification, dashboard/reporting enhancement, financial integrity preservation, and security boundary enforcement. (Design-only phase; no code changes implemented).

---

## 1. Executive Summary

Phase P2 establishes a comprehensive database performance optimization design for ZemiFix CMMS. Building upon the Phase P1 authentication memoization, Phase P2 addresses database execution latency, excessive relation loading (`include`), unbound query result sets (`findMany`), missing PostgreSQL indexes on frequently filtered foreign keys and status fields, and dashboard query consolidation. All proposed optimizations strictly preserve ZemiFix's multi-tenant isolation, branch access scopes, RBAC permissions, audit logging, and financial ledger integrity.

---

## 2. Current Database Performance Architecture

- **ORM & Client:** Prisma 6 with client extension (`uuidv7-injector`) targeting PostgreSQL.
- **Connection Management:** Connection pooling via `prisma.ts` singleton instance.
- **Identified Architectural Weaknesses:**
  - Many list views fetch complete unpaginated datasets with deep relational trees (`include: { tasks: true, checklists: true, labor: true, parts: true, attachments: true, statusHistory: true }`).
  - Dashboard queries execute numerous independent aggregations sequentially rather than in parallel using `Promise.all()`.
  - Certain frequently filtered foreign keys and status/date combinations lack optimal composite indexes in PostgreSQL.

---

## 3. Module-by-Module Findings

1. **Work Orders:** High relational load; fetches tasks, checklists, labor, parts, and attachments in single queries. Needs default pagination and selective column projection (`select`).
2. **Assets:** Heavy relational inclusions (BOMs, meter readings, downtime logs, status history). Needs cursor or offset pagination.
3. **Inventory:** Stock transactions and stock balances require indexed lookups on `storeId` and `partId`.
4. **Finance:** Invoices, invoice lines, payments, and allocations involve decimal computations and relational joins.
5. **Reports:** Heavy aggregate reporting queries scanning broad date ranges without pre-aggregation or date partitioning indexes.
6. **Dashboard:** Executes multiple sequential `prisma.workOrder.groupBy`, `prisma.asset.groupBy`, and count queries. Can be optimized with `Promise.all()`.
7. **Procurement:** Requisitions, RFQs, POs, and GRNs require indexed foreign keys for supplier and branch filtering.
8. **Preventive Maintenance:** Maintenance plan evaluation queries scan active asset schedules.
9. **Maintenance Requests:** Public intakes and portal requests require indexed site and status filters.
10. **Organization:** Branch and department hierarchical path queries benefit from materialized path indexes.
11. **Users and Roles:** Permission resolution relies on role-permission join tables.
12. **Customer Portal:** Restricted queries governed by `CustomerContactSiteGrant` and site ID filters.
13. **Technician PWA:** Offline sync batch mutations and outbox synchronization queries.

---

## 4. Confirmed Slow Queries

- **Unbounded Work Order Lists:** `prisma.workOrder.findMany` with deep nested includes fetching all records matching branch scope without `take` or `skip`.
- **Sequential Dashboard Aggregations:** Dashboard statistics fetched sequentially rather than concurrently.

---

## 5. Suspected Slow Queries

- **Inventory Stock Ledger Aggregations:** Calculating weighted average cost (WAC) and stock transactions across high-volume part movement histories.
- **Audit Log Date Range Scans:** Querying broad audit log histories without optimized composite indexes on `(resource, resourceId, createdAt)`.

---

## 6. N+1 Query Findings

- **Relational Mapping:** Identified potential N+1 query patterns in reporting and export services where related records (e.g. technician user names or part descriptions) are resolved in loops rather than batched `findMany` or single `include` queries.

---

## 7. Pagination Strategy

- **Default Page Size:** 50 records per page for transactional list views (Work Orders, Assets, Invoices, Purchase Orders).
- **Maximum Page Size:** 200 records per page to prevent memory exhaustion and excessive payload serialization overhead.
- **Pagination Mechanism:** Offset pagination (`skip` / `take`) for standard admin tables; cursor-based pagination (`cursor` / `take`) for high-throughput append-only logs (Stock Transactions, Audit Logs).

---

## 8. Proposed Database Indexes

| Table | Columns | Query Supported | Reason / Benefit | Storage & Write Impact |
| :--- | :--- | :--- | :--- | :--- |
| `work_orders` | `(branchId, status, createdAt)` | Branch work order list filtering & sorting | Avoids full table scans on multi-branch operational dashboards | Low storage overhead; minor write overhead on insert/update |
| `assets` | `(managingBranchId, status)` | Branch asset inventory lists | Accelerates branch asset lookup and status counts | Low storage overhead; negligible write impact |
| `stock_transactions` | `(storeId, partId, createdAt)` | Part ledger movement history | Speeds up inventory valuation and stock card rendering | Medium index size due to transaction volume |
| `audit_logs` | `(resource, resourceId, createdAt)` | Entity audit trail retrieval | Instantaneous loading of entity history | Essential for tamper-evident audit audit speed |
| `invoices` | `(customerId, status, dueDate)` | Customer billing lists & overdue tracking | Speeds up portal and finance invoice queries | Low overhead |

---

## 9. Dashboard and Reporting Optimization Strategy

- **Concurrency:** Wrap independent dashboard summary queries in `Promise.all()` to execute them concurrently against PostgreSQL connection pool.
- **Caching:** Cache non-sensitive aggregate metrics (e.g. total asset counts, active maintenance plan summaries) for brief TTL windows (e.g. 60 seconds) in memory or Redis where applicable.
- **Financial Integrity:** Never cache permission-dependent or tenant-isolated financial summaries across distinct user security contexts.

---

## 10. Inventory and Financial Integrity Considerations

- **Stock Ledger & WAC:** All inventory issues, receipts, and transfers must maintain strict transactional integrity (`prisma.$transaction`) to preserve Weighted Average Cost (WAC) calculations and stock ledger immutability.
- **Maker-Checker:** Approval flows and dual-control constraints remain strictly enforced inside database transactions.

---

## 11. Security and Tenant-Isolation Impact

- **Zero Security Compromise:** All optimized queries will continue to apply strict `where` clauses enforcing tenant isolation (`customerId`), branch scopes (`branchId` in authorized paths), and customer site grants (`siteId` in authorized site IDs).
- **RBAC:** Explicit permission filters remain intact.

---

## 12. Prioritized Implementation Plan

### Critical
1. **Parallelize Dashboard Queries:** Wrap independent dashboard aggregate queries in `Promise.all()`.
2. **Enforce Default Pagination:** Add `take: 50` and `skip` parameters to heavy list services (`workOrderService.ts`, `assetService.ts`, `billingService.ts`).

### High
3. **Add Missing Composite Indexes:** Apply high-impact PostgreSQL indexes for branch, status, and date filtering.
4. **Selective Column Projection (`select`):** Replace blanket `include` statements with targeted `select` statements in lookup and summary lists.

### Medium
5. **Optimize Inventory Ledger Queries:** Batch stock transaction lookups to eliminate potential N+1 queries.

### Low
6. **Query Plan Tuning:** Review `EXPLAIN ANALYZE` metrics for reporting export endpoints.

---

## 13. Testing and Benchmarking Strategy

- **Benchmarking:** Measure query execution duration and response payload size before and after pagination and select projection.
- **Isolation Testing:** Run automated integration tests against isolated PostgreSQL instances to verify correctness and authorization integrity.
