# ZemiFix Performance Phase P1: Authentication and Session Validation Optimization Design

**Date:** November 18, 2026  
**Project Directory:** `E:/HP/Downloads/remix-zemifix-cmms`  
**Scope:** Architecture and technical design for optimizing authentication performance (`getCurrentUser()`) without compromising security, session revocation, RBAC, or tenant isolation. (Design only; no code changes implemented in this task).

---

## 1. Current Authentication Flow & Bottleneck

- **Mechanism:** In `src/lib/auth.ts`, `getCurrentUser(req?: NextRequest)` extracts the `zemifix_session` cookie, verifies the signed JWT (`verifySessionToken`), extracts the `userId`, and executes a live PostgreSQL query (`prisma.user.findUnique`) with deep relation inclusions (`role.permissions.permission`, `branch`, `department`).
- **Bottleneck:** During page rendering, a Server Component layout and its child page or concurrent API fetch operations frequently invoke `getCurrentUser()` multiple times within the same HTTP request lifecycle, resulting in redundant database queries for the exact same user session.

---

## 2. Identified Duplicate Queries

- **Layout + Component Interleaving:** In Next.js App Router, root layout rendering, nested page layouts, and client-side or server-side data fetching often independently validate authentication.
- **API Route Handlers:** Client-side components fetching data from API routes (`/api/...`) trigger `getCurrentUser(req)` inside the API handler route, repeating database round trips even when the page server component already validated the user session milliseconds earlier.

---

## 3. Exact Files and Functions Involved

- **`src/lib/auth.ts`**: Contains `getCurrentUser()`, `verifySessionToken()`, and `requireAuth()`.
- **`src/lib/prisma.ts`**: Prisma client initialization.
- **Server Components & API Route Handlers across all modules.**

---

## 4. Proposed Optimization: Request-Scoped Memoization

- **Technique:** Wrap the core database-fetching portion of `getCurrentUser()` (or wrap `getCurrentUser()` itself) using React's built-in `cache()` utility (`import { cache } from 'react'`).
- **How it Works:** React `cache()` memoizes the return value of a function for the duration of a single React server request lifecycle. Subsequent calls to `getCurrentUser()` with the same request cookies within the same server render pass return the cached user object instantly without executing a duplicate database query.

---

## 5. Security Implications & Preservation of Controls

- **Session Revocation:** Maintained because session tokens are still cryptographically verified on every request, and database-level active status checks (`isActive: true`, `deletedAt: null`) occur during the initial request-scoped fetch.
- **Permission Freshness:** Permissions remain fresh per HTTP request. Across separate requests, cache is naturally dropped as React `cache()` is request-scoped.
- **Tenant Isolation:** Fully preserved. Platform and tenant authentication remain strictly separated.

---

## 6. Session Revocation Behavior
- Revoked tokens fail `verifySessionToken()`. Deactivated accounts fail `user.isActive` checks on the initial request fetch. Request memoization does not bypass revocation checks across distinct requests.

---

## 7. Permission Freshness Behavior
- Because React `cache()` scope is strictly bound to a single incoming HTTP request, permissions are evaluated fresh on every new page navigation or API call.

---

## 8. Multi-Instance Deployment Implications
- Request-scoped memoization operates in-memory per Node.js server instance for a single request. For multi-instance scaling in future enterprise deployments, a distributed Redis L1 cache can be introduced behind `getCurrentUser()`.

---

## 9. Testing Strategy
- **Test Scenarios:**
  1. Verify multiple `getCurrentUser()` calls within a single request execute only one Prisma query.
  2. Verify expired or revoked sessions are correctly rejected.
  3. Verify deactivated users return `null`.
  4. Verify concurrent requests maintain proper data isolation.

---

## 10. Expected Performance Improvements
- Eliminates 50% to 80% of redundant database round trips during complex page renders involving nested layouts and companion API routes.
- Reduces navigation latency significantly by removing synchronous database queuing for auth validation passes.
