# R1 Public QR Maintenance Request — Requirements

## Assumptions

> These inferences were made from examining the codebase; the design review should validate them.

1. **QR identity is not yet modelled.** The schema has no `qrToken` column on `Asset` or `CustomerSite`, and no QR generation service exists. The feature must add secure per-entity tokens without replacing or duplicating the existing `assetTag` / `siteCode` lookup.
2. **`submitPublicQrRequest()` accepts `siteCode` + optional `assetTag`.** That is the existing resolution path. QR tokens must ultimately resolve to these same identifiers server-side; the token is an opaque indirection layer, not a replacement.
3. **`WorkRequest` requires a `requesterUserId` (non-nullable FK).** A public submission cannot create a `WorkRequest` directly because there is no authenticated user. The `PublicRequestIntake` row *is* the pending state; a Planner manually converts it to a `WorkRequest` or `WorkOrder`.
4. **Photo storage for public submissions is incomplete.** `PublicRequestIntake.photoUrl` stores a string, but the existing `/api/public/requests` route accepts `photoUrl` as a plain string in the JSON body — no multipart upload endpoint exists for public photos. A dedicated upload endpoint under `/api/public/uploads` is needed, following the same `saveAssetImage()` / magic-byte validation pattern used by asset images.
5. **The middleware allows all `/api/*` routes through without session enforcement** (line 86 of `middleware.ts`: `if (pathname.startsWith('/api/')) return response`). The `/request/qr` page route is *not* listed in `PUBLIC_PATHS`, so it currently redirects anonymous users to `/login`. The page route must be exempted; the API route already passes through.
6. **Planner review UI for `PublicRequestIntake` does not exist.** The `/requests` page shows `WorkRequest` rows only. A new view or section must expose `PublicRequestIntake` rows to authorized staff.
7. **No duplicate-work-order guard exists on `PublicRequestIntake`.** `processedRequestId` is nullable and never set. The conversion service must set it atomically to prevent double-processing.
8. **`WorkRequest.branchId` is required.** When converting a public intake, the branch must be inferred from the asset's `branchId` or the customer site's managing branch. If neither is determinable, the Planner must select a branch.
9. **`CustomerSite` is used in contractor mode; internal `Location` is a separate model.** The form's site context comes from `CustomerSite.siteCode`. The QR for an internal location (facility) would need to identify a `Location` instead, but the existing `submitPublicQrRequest()` only resolves `CustomerSite`. This feature treats "facility" as `CustomerSite` and "asset" as `Asset`. Extending to internal `Location` is **out of scope** for this iteration.
10. **No notification template exists for `PUBLIC_REQUEST_RECEIVED`.** A new event type must be registered (or the notification service extended) to alert Planners of incoming public submissions.

---

## Summary

A member of the public (facility user, site visitor, tenant) scans a ZemiFix QR code on a physical asset or customer site, opens a mobile-friendly form at `/request/qr?token=<token>`, submits a maintenance fault report with an optional photo, and receives a confirmation. The submission is stored as a `PublicRequestIntake` record and routed to the Planner queue. Authorized staff review, reject, or convert the intake into a `WorkRequest` or `WorkOrder` using the existing workflow. No new workflow is introduced; the feature plugs into the established intake → review → convert path.

---

## Functional Requirements

### FR-1: Anonymous access to the QR form

1. The route `/request/qr` must be accessible to unauthenticated users on any device without redirecting to `/login`.
2. The middleware must add `/request/qr` and `/api/public/` to the exemption list without disabling any other security controls.
3. The form must render on mobile viewports (≥320 px wide) with touch-friendly inputs and no horizontal scroll.
4. The page must follow ZemiFix visual identity: Navy `#0B1336` background, Orange `#FF5B00` accent, white card surface, clean professional typography.

### FR-2: QR token generation and resolution

5. Each `Asset` and each `CustomerSite` must have exactly one non-guessable public token (`qrToken`, 32 bytes of cryptographic random, stored as a URL-safe base64 string).
6. Tokens must be generated lazily on first access or explicitly via a staff action; they must never be regenerated unless explicitly reset by staff.
7. No two records may share the same token (unique constraint).
8. The QR code URL format is `/request/qr?token=<qrToken>`. Internal database IDs must not appear in the URL.
9. Authorized staff must be able to view, download, and print a QR code image for any asset or customer site via the existing staff UI (asset detail page and customer site detail page). The QR image is generated client-side using the existing stack (no new backend image-generation service).
10. The form page must silently resolve the token server-side (via a lightweight `GET /api/public/resolve?token=<token>` endpoint) and pre-populate site name and asset name without exposing IDs, raw `siteCode`, or `assetTag` to the browser.

### FR-3: Public request form fields and submission

11. Required fields: requester name (string), email address (valid email format), phone number (string), problem description (free text).
12. Optional field: photo attachment (single image, JPEG/PNG/WebP, ≤ 5 MB).
13. The site and asset context is resolved from the QR token; the user is never shown or asked to enter `siteCode`, `assetTag`, or any internal identifier.
14. The form must display the resolved site name and, if applicable, asset name so the user can confirm the correct location before submitting.
15. Photo upload must be a two-step process: (a) the browser uploads the file to `POST /api/public/uploads/photo` and receives a storage reference; (b) the storage reference is included in the final submission JSON. This matches the architecture used by asset image uploads.
16. All field validation must run server-side. Client-side validation is additive and not a security control.
17. On successful submission the page must show a confirmation screen. The confirmation must not expose the intake ID or any internal reference.
18. On error (rate limit, inactive site, invalid token) the form must show a user-friendly plain-language error message. No internal error codes or stack traces are shown to public users.
19. An idempotency key (browser-generated UUID) must be included in the submission to prevent double-submission from repeated clicks or network retries.

### FR-4: Server-side validation and abuse protection

20. `POST /api/public/requests` must validate: token present and resolves to an active `CustomerSite`; site's `isActive` is `true` and `deletedAt` is `null`; if an asset token is provided, the asset's `isActive` is `true` and `deletedAt` is `null`; requester name ≤ 100 chars; email ≤ 150 chars, valid format; phone ≤ 50 chars; description ≤ 2000 chars; photo storage ref present in `storage/uploads/public-requests/` if provided.
21. Rate limiting: maximum 10 requests per IP per 60-minute window via the existing `checkRateLimit()` service. The public route handler already calls this; the threshold must be verified as configured.
22. Idempotency: if a `PublicRequestIntake` row already exists with the submitted `idempotencyKey`, return `201` with the existing record (no duplicate insert).
23. Photo uploads (`POST /api/public/uploads/photo`) must validate MIME type (`image/jpeg`, `image/png`, `image/webp`), file size (≤ 5 MB), and magic bytes using the existing `saveAssetImage()` or an equivalent function that writes to `storage/uploads/public-requests/`. The endpoint is anonymous; it stores the file and returns only an opaque storage reference.
24. The public photo endpoint must be rate-limited separately: 5 uploads per IP per 10 minutes.
25. Stored public intake photos must not be accessible via a guessable URL. Serving must require either the Planner's staff session or be served from a non-public filesystem path, consistent with how asset images are served.

### FR-5: `PublicRequestIntake` persistence

26. Each accepted submission must create exactly one `PublicRequestIntake` row with `status = 'RECEIVED'`.
27. The record must store: `siteId`, `assetId` (nullable), `requesterName`, `requesterEmail`, `requesterPhone`, `description`, `photoUrl` (nullable storage ref), `clientIp`, `idempotencyKey` (nullable), `status`.
28. `processedRequestId` must be set when the intake is converted, as an FK to the resulting `WorkRequest` or `WorkOrder`, to prevent duplicate processing.
29. No `WorkRequest` or `WorkOrder` is created by the public submission path. The `PublicRequestIntake` enters the Planner queue at `status = 'RECEIVED'`.

### FR-6: Planner review interface

30. Authorized staff (users with the `work_request:review` permission or the `Admin` / `Planner` role) must have a dedicated view — a new tab or section within the existing `/requests` page, or a new `/requests/intake` page — that lists all `PublicRequestIntake` records with `status = 'RECEIVED'`.
31. The list must show: submission timestamp, requester name, site name, asset name (if any), description excerpt, and status badge.
32. Opening an intake detail must show: full requester information (name, email, phone), full description, site name and address, asset name and tag (if any), submission timestamp, and photo (if present).
33. The Planner must be able to reject the intake with a mandatory reason. On rejection, `status` becomes `'REJECTED'` and the rejection reason is stored in a new `rejectionReason` column (or the existing `status` notes field if one exists). No external notification to the public reporter is sent (they have no account).
34. The Planner must be able to convert the intake into a `WorkRequest` using the existing `createWorkRequest()` service. The resulting `WorkRequest` is owned by the Planner's user account. `processedRequestId` is set to the new `WorkRequest.id` and `status` becomes `'PROCESSED'`.
35. The Planner must be able to convert the intake directly into a `WorkOrder` using the existing `reviewWorkRequest()` / `createWorkOrder()` path, or a new `convertPublicIntakeToWorkOrder()` function that mirrors it. `processedRequestId` is set to the new `WorkOrder.id`.
36. If `processedRequestId` is already set (not null), the convert action must be blocked with an error: "This intake has already been processed." No duplicate work orders or work requests may be created.
37. All conversion actions must emit an audit log entry via `appendAuditLog()`.
38. The existing `/requests` page and `WorkRequest` listing must be unaffected.

### FR-7: Security controls

39. `/request/qr` and `/api/public/requests` are anonymous. All other API routes remain protected by the existing session-cookie check.
40. `GET /api/public/resolve` must return only display-safe fields: site name, asset name. It must not return `siteCode`, `assetTag`, internal UUIDs, customer name, or address.
41. `GET /api/public/resolve` must return `404` for any unrecognised token with no information leakage (same response body for "not found" and "inactive").
42. The public photo serve endpoint must enforce that the requester is an authenticated staff user (the same `getCurrentUser()` check used by asset image endpoints).
43. CSRF protection in middleware must remain intact. `POST /api/public/requests` and `POST /api/public/uploads/photo` originate from the same origin (`/request/qr` is served from the same domain), so CSRF headers are present and no exemption is needed.
44. QR tokens must not be derivable from asset tags, site codes, database IDs, or any other predictable input. Each token must be generated with `crypto.randomBytes(32)`.
45. Resetting a QR token must require an explicit staff action and must be audit-logged.

---

## Non-Functional Requirements

**NFR-1 — Mobile performance.** The form page, including QR resolution, must complete initial load within 3 seconds on a 4G mobile connection (lighthouse mobile score ≥ 70).

**NFR-2 — Storage isolation.** Public intake photos must be stored in `storage/uploads/public-requests/` separate from asset images (`storage/uploads/assets/`) and work-order attachments (`storage/uploads/work-orders/`).

**NFR-3 — No schema destructive operations.** The only schema change allowed is adding a `qrToken` column to `Asset` and `CustomerSite`, a `rejectionReason` column to `PublicRequestIntake`, and the `processedRequestId` FK (if not already present). No existing columns may be dropped or renamed.

**NFR-4 — Technician PWA unaffected.** No changes to `src/lib/pwa/`, the PWA sync service, or any existing work order APIs used by the PWA.

**NFR-5 — Test coverage.** All 16 acceptance criteria (AC-1 through AC-16) must have corresponding automated tests that can run against `zemifix_dev`. Tests must not write to `zemifix_acceptance`.

---

## Acceptance Criteria

**AC-1 — Anonymous access.** A `GET /request/qr?token=<valid-token>` request with no session cookie returns HTTP 200, not a redirect to `/login`.

**AC-2 — Staff login not required for submission.** A `POST /api/public/requests` with a valid body and no session cookie returns HTTP 201 and a `PublicRequestIntake` row in `status = 'RECEIVED'`.

**AC-3 — Valid asset QR resolves correctly.** `GET /api/public/resolve?token=<asset-qrToken>` returns the asset name and site name and does not include the asset's `assetTag`, `siteCode`, or any UUID.

**AC-4 — Valid facility/site QR resolves correctly.** `GET /api/public/resolve?token=<site-qrToken>` returns the site name and no internal identifiers.

**AC-5 — Invalid token is rejected.** `GET /api/public/resolve?token=bogus` returns HTTP 404 with no details about whether the token exists or the site is active.

**AC-6 — Inactive site or inactive asset rejects submission.** `POST /api/public/requests` with a token that resolves to a site where `isActive = false` returns HTTP 400. `POST /api/public/requests` with a token for an asset where `isActive = false` returns HTTP 400.

**AC-7 — Required field validation.** `POST /api/public/requests` omitting `requesterName`, `requesterEmail`, `requesterPhone`, or `description` returns HTTP 400 with a field-specific error message.

**AC-8 — Photo upload validation.** `POST /api/public/uploads/photo` with a file that has an invalid MIME type returns HTTP 400. A file exceeding 5 MB returns HTTP 400. A valid JPEG/PNG/WebP file ≤ 5 MB is stored and returns HTTP 200 with a storage reference.

**AC-9 — Public request submission succeeds end-to-end.** A complete form submission (with token, all required fields, and an optional photo) returns HTTP 201 and creates one `PublicRequestIntake` row in the database.

**AC-10 — Submission is in the correct database table.** After AC-9, `SELECT * FROM public_request_intake WHERE id = '<returned-id>'` on `zemifix_dev` returns exactly one row with `status = 'RECEIVED'`.

**AC-11 — Planner can see submitted intake.** An authenticated user with the Planner role can retrieve the submitted intake via the staff intake listing endpoint (new `GET /api/requests/intake`) and the response includes the requester name and description.

**AC-12 — Planner can review and process the intake.** An authenticated Planner can call the convert action on an intake and receive a `WorkRequest` or `WorkOrder` in response. The intake row's `processedRequestId` is set and `status` is `'PROCESSED'`.

**AC-13 — Conversion follows existing workflow.** A converted `WorkRequest` created from an intake appears in `GET /api/requests` and follows the normal `SUBMITTED → CONVERTED` lifecycle via `reviewWorkRequest()`.

**AC-14 — Duplicate processing is blocked.** Calling the convert action twice on the same intake ID returns HTTP 400 with "already been processed". The database has exactly one resulting `WorkRequest` or `WorkOrder`.

**AC-15 — Unauthorized users cannot access internal intake data.** `GET /api/requests/intake` with no session cookie returns HTTP 401. A session cookie for a user without the `work_request:review` permission returns HTTP 403.

**AC-16 — Existing work orders and Technician PWA are unaffected.** After all feature changes are applied: (a) `GET /api/work-orders` with a valid staff session still returns existing work orders; (b) the PWA sync endpoint (`GET /api/sync` or equivalent) still responds without error; (c) no existing passing tests are broken.

---

## Out of Scope

- Push or email notifications to the public reporter (they have no account or verified address in the system).
- Support for internal `Location` model as a QR target (only `CustomerSite` and `Asset` are in scope).
- Multi-photo attachments on a single public submission.
- Public reporter tracking requests after submission (no status lookup page).
- SMS or OTP verification of the reporter's identity before submission.
- QR code scanning logic (the browser's native camera or a QR reader app handles scanning; the app only receives the resulting URL).
- Bulk QR code generation or printing across multiple assets.
- Internationalization or multi-language form support.
- Any change to `zemifix_acceptance` database or schema.
- Any commit, push, or deployment action.
