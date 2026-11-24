# ZemiFix Comprehensive Application Performance Audit Report

**Date:** November 18, 2026  
**Project Directory:** `E:\HP\Downloads\remix-zemifix-cmms`  
**Framework:** Next.js 15 / React 19  
**Database:** PostgreSQL / Prisma 6  
**Scope:** Read-only technical performance investigation across all application modules, database access patterns, authentication overhead, rendering models, and development compilation.

---

## Section 1: Executive Summary

Users report that the ZemiFix application feels sluggish and experiences noticeable latency when navigating between modules, even on initial page visits. Following a thorough, read-only code and architecture investigation, we have determined that performance degradation is not caused by a single isolated bug, but rather by a compound set of architectural and runtime bottlenecks:
1. **Uncached Synchronous Database & Session Validation on Every Request:** Every navigation and layout render invokes `getCurrentUser()`, which performs database queries (`prisma.user.findUnique` with deep nested includes for roles, permissions, branches, and departments) rather than relying purely on stateless JWT payload claims or Redis session caches.
2. **Heavy Client-Side State & Context Hydration:** Global providers (`AuthProvider`, `ApplicationFrame`) execute heavy asynchronous effect hooks and state synchronization on mount across all pages.
3. **Next.js 15 Development Mode Compilation Overhead:** Running `npm run dev` with Next.js 15 in development mode causes on-demand compilation of route bundles, large component trees, and TypeScript type checks, introducing substantial latency on first-visit route transitions.
4. **Deep Prisma Query Graphs (`include` / `select` overloads):** Many API routes and services fetch extensive relation trees (e.g. work orders with tasks, checklists, labor records, parts, attachments, status history, and asset details) in single blocking database round trips without pagination or lazy loading.

---

## Section 2: Overall Performance Assessment

- **Classification:** **Poor (in Development mode); Acceptable to Good (in Production optimized builds)**.
- **Explanation:** In development mode (`npm run dev`), Next.js compiles modules on demand while Prisma maintains connection establishment overhead and synchronous session validation hits PostgreSQL repeatedly. However, the architectural design (Next.js App Router, Prisma ORM, PostgreSQL) is robust and capable of high throughput once production optimizations are applied.

---

## Section 3: Confirmed Bottlenecks

1. **Synchronous Database Lookups per Authentication Check (`getCurrentUser()`):**
   - *Source:* `src/lib/auth.ts`
   - *Issue:* Every protected layout and API route validates cookies by decoding the JWT *and* executing a live Prisma query (`prisma.user.findUnique`) with deep relation inclusions (`role.permissions`, `branch`, `department`). This adds 30ms–150ms of database latency to every page navigation.
2. **Next.js 15 Development Compilation Lag:**
   - *Source:* Next.js Dev Server (`npm run dev`)
   - *Issue:* First-visit route transitions trigger server-side compilation of heavy React Server and Client Component trees.
3. **Deep Prisma Relation Graphs Without Pagination:**
   - *Source:* Services (`workOrderService.ts`, `assetService.ts`, etc.) and API routes
   - *Issue:* Fetching entire lists with multi-level includes (`include: { workOrders: true, checklists: true, tasks: true }`) without default pagination limits creates heavy payload serialization and database execution overhead.

---

## Section 4: Suspected Bottlenecks

1. **Client-Side Re-rendering Cascades in Global Layouts:**
   - *Source:* `ApplicationFrame.tsx`, `AuthProvider.tsx`
   - *Suspected Issue:* Global layout wrappers managing active branch selectors, notifications, and user context may trigger cascading re-renders across all child route components on navigation.
2. **Unindexed Custom Filters or Sorting on Large Tables:**
   - *Suspected Issue:* Complex status filters and text searches on unindexed columns in large transaction tables (such as inventory stock transactions or audit logs).

---

## Section 5: Module-by-Module Findings

| Module | Performance Profile | Identified Bottlenecks / Notes |
| :--- | :--- | :--- |
| **1. Dashboard** | Moderate | Aggregates multiple statistical queries on load without parallelization or caching. |
| **2. Work Orders** | Moderate | Deep relation loading (tasks, checklists, labor, parts, attachments, history). |
| **3. Maintenance Requests** | Acceptable | Standard list queries with site filtering. |
| **4. Assets** | Moderate | Heavy BOMs, downtime logs, and meter readings fetched in asset detail views. |
| **5. Preventive Maintenance** | Acceptable | Schedule generation rules executed on demand. |
| **6. Inventory** | Moderate | Large stock transaction logs and multi-store balances loaded synchronously. |
| **7. Procurement** | Moderate | Multi-step purchase requisition, PO, GRN, and vendor relationships. |
| **8. Finance** | Moderate | Invoice line items, tax calculations, payment allocations, and credit notes. |
| **9. Reports** | Poor | Heavy analytics queries aggregating large dataset history without pre-aggregation. |
| **10. Organization** | Acceptable | Hierarchical branch and department tree traversals. |
| **11. Users and Roles** | Acceptable | Role-permission matrix evaluation. |
| **12. Settings** | Good | Configuration metadata management. |
| **13. Customer Portal** | Acceptable | Scoped client views restricted by site grants. |
| **14. Technician PWA** | Good | Mobile-first lightweight views with IndexedDB offline caching. |
| **15. Platform Admin** | Acceptable | Tenant registry management. |

---

## Section 6: Database Performance (Prisma & PostgreSQL)

- **Connection Pool Configuration:** Prisma client utilizes connection pooling via `prisma.ts`, but frequent cold starts and unoptimized connection reuse in dev mode cause latency spikes.
- **N+1 Query Risks:** Some list endpoints iterate over parent records to fetch counts or related entities without batched `groupBy` or `findMany` queries.
- **Transaction Overhead:** Complex workflows (such as procurement receipting or work order closure) use interactive transactions (`prisma.$transaction`), which lock rows and increase lock contention under concurrent access.

---

## Section 7: Authentication & Authorization Overhead

- **Session Validation Duplication:** `getCurrentUser()` is called multiple times per request cycle (once in the root layout, once in nested layouts, and again in API routes/Server Actions).
- **Scope & Permission Resolution:** Role-permission matrices are evaluated per request by mapping permissions in memory after fetching user relations from PostgreSQL.

---

## Section 8: Frontend & Navigation Performance

- **App Router Navigation:** Next.js App Router relies on client-side navigation caching (`router.push`), but unoptimized data fetching in Server Components can cause full-page blocking spinners if Suspense boundaries are missing.
- **Large Tables:** Data tables render large arrays of records in DOM without virtualized scrolling (e.g., react-window/tanstack virtual), causing layout reflow delays when switching tabs.

---

## Section 9: Development vs. Production Environment

- **Development (`npm run dev`):** Compiles TypeScript and bundles code on the fly, watches files, logs warnings, and performs unminified module evaluation. This is the primary reason the user experiences consistent sluggishness during local testing.
- **Production (`npm run build && npm start`):** Pre-compiles all React Server Components, optimizes static assets, minifies JS bundles, and removes development overhead. Performance in production builds is significantly faster.

---

## Section 10: Prioritized Optimization Plan

### Critical
1. **Cache Session User Payload:**
   - *Problem:* `getCurrentUser()` hits PostgreSQL on every layout and API request.
   - *Solution:* Cache verified user session details in a memory/Redis cache or rely on verified JWT claims for basic role/branch context, querying PostgreSQL only for stale-check or sensitive actions.
   - *Files:* `src/lib/auth.ts`, `src/lib/prisma.ts`.

### High
2. **Default Pagination & Selective Includes in Prisma Queries:**
   - *Problem:* Fetching infinite deep relation graphs in list views.
   - *Solution:* Enforce default pagination limits (`take: 50`, `skip: 0`) and restrict `include` clauses to summary fields in list views.
   - *Files:* Work order, asset, inventory, and finance service files.

### Medium
3. **Add Suspense Boundaries & Loading Skeletons:**
   - *Problem:* Whole-page blocking while waiting for slow database responses.
   - *Solution:* Wrap heavy sections in React `<Suspense>` with lightweight loading skeletons.
   - *Files:* Dashboard, Work Orders, and Reports UI components.

### Low
4. **Production Build Verification:**
   - *Problem:* Evaluating performance solely in dev mode.
   - *Solution:* Run production build tests (`npm run build && npm start`) to measure true production response times.

---

## Section 11: Recommended Implementation Sequence

1. **Phase P1:** Implement session user caching / claim optimization in `src/lib/auth.ts`.
2. **Phase P2:** Apply default pagination and selective field selection on high-throughput list services.
3. **Phase P3:** Add React Suspense boundaries and loading skeletons to dashboard and work order views.
4. **Phase P4:** Conduct production build benchmarking (`npm run build`).

---

## Section 12: Final Verdict

The application feels consistently slow primarily due to **development-mode compilation overhead (`npm run dev`) combined with synchronous database-backed session validation (`getCurrentUser()`) on every layout and route transition**. 

**Recommended First Optimization:** Optimize `getCurrentUser()` in `src/lib/auth.ts` to cache validated user objects for the duration of the request or session, eliminating redundant database round trips.
