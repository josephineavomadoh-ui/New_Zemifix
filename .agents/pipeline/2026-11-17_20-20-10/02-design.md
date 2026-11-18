# R1 Public QR Maintenance Request — Technical Design

## Overview

This feature wires six previously-separate concerns into a coherent end-to-end flow: anonymous page access, QR token life-cycle, photo upload, public submission storage, Planner review UI, and intake-to-work-order conversion. The architecture is a pure extension of what already exists. `submitPublicQrRequest()` in `portalService.ts` already writes to `PublicRequestIntake`; `checkRateLimit()` is already called; `saveAssetImage()` / magic-byte validation already works; `reviewWorkRequest()` / `appendAuditLog()` already handle conversion and audit trails. What is missing is: (1) a `qrToken` column on `Asset` and `CustomerSite` with a generation service, (2) a secure token-resolution endpoint, (3) a dedicated photo upload endpoint for public use, (4) a rework of the QR form to use token-based pre-population instead of raw `siteCode`/`assetTag` inputs, (5) middleware exemption for the public page route, (6) a `rejectionReason` column and `processedRequestId` FK on `PublicRequestIntake`, (7) a Planner intake review page and backing API route, and (8) test coverage for all 16 acceptance criteria. No new framework or separate backend is introduced. The stack is **Next.js 15 / React 19 / TypeScript / Prisma 6 / PostgreSQL**.

---

## 1. Schema Changes (one migration)

Three targeted additions — no existing columns dropped or renamed.

### 1.1 `qrToken` on `Asset` and `CustomerSite`

```prisma
// Asset
qrToken  String?  @unique @db.VarChar(50)

// CustomerSite
qrToken  String?  @unique @db.VarChar(50)
```

Both are nullable until first generated (lazy generation). Both have a `@@unique` / `@unique` constraint enforced at the database level, preventing duplicate tokens. No existing columns change. The column is `VarChar(50)` because URL-safe base64 of 32 raw bytes is 43 characters.

### 1.2 `rejectionReason` on `PublicRequestIntake`

The existing schema has no rejection reason column. Add:

```prisma
rejectionReason  String?  @db.Text
```

The `status` column already exists as `VarChar(30)` with values `RECEIVED | PROCESSED | SPAM`. Add `REJECTED` to the allowed values in service-layer code. No enum change is needed in Prisma because `status` is a plain `String`, not a Prisma enum.

### 1.3 `processedRequestId` FK on `PublicRequestIntake`

The column already exists in the schema:

```
processedRequestId String? @db.Uuid
```

It has no FK relation defined in schema.prisma (it stores either a `WorkRequest.id` or a `WorkOrder.id`, so a polymorphic FK is not feasible in Prisma). The existing column is used as-is. The service layer sets it atomically within a transaction using an optimistic `update … where processedRequestId IS NULL` pattern.

**Migration file:** `prisma/migrations/YYYYMMDDHHMMSS_r1_qr_token_and_intake_fields/migration.sql`

```sql
-- Add qrToken to assets
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "qrToken" VARCHAR(50) UNIQUE;

-- Add qrToken to customer_sites
ALTER TABLE "customer_sites" ADD COLUMN IF NOT EXISTS "qrToken" VARCHAR(50) UNIQUE;

-- Add rejectionReason to public_request_intake
ALTER TABLE "public_request_intake" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

-- Index for fast qrToken lookup on both tables
CREATE UNIQUE INDEX IF NOT EXISTS "assets_qr_token_key" ON "assets"("qrToken") WHERE "qrToken" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "customer_sites_qr_token_key" ON "customer_sites"("qrToken") WHERE "qrToken" IS NOT NULL;
```

The `processedRequestId` column already exists in the production table (it is in `schema.prisma`). The migration must guard with `IF NOT EXISTS`.

---

## 2. QR Token Service (`src/lib/services/qrTokenService.ts`)

A new, single-purpose service. It is the only place that generates or invalidates QR tokens. All other modules import from here — no duplicate logic.

```typescript
import crypto from 'crypto';
import { prisma } from '../prisma';
import { appendAuditLog } from './auditService';

/** Generate a URL-safe base64 token from 32 crypto-random bytes */
function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url'); // 43 chars
}

/**
 * Returns the existing qrToken for an Asset, generating one if absent.
 * Never regenerates an existing token unless resetQrToken() is called explicitly.
 */
export async function getOrCreateAssetQrToken(assetId: string, actorUserId: string): Promise<string> { ... }

/**
 * Returns the existing qrToken for a CustomerSite, generating one if absent.
 */
export async function getOrCreateSiteQrToken(siteId: string, actorUserId: string): Promise<string> { ... }

/**
 * Resets the qrToken for an Asset. Requires explicit staff action. Audit-logged.
 * The old QR code immediately becomes invalid.
 */
export async function resetAssetQrToken(assetId: string, actorUserId: string): Promise<string> { ... }

/**
 * Resets the qrToken for a CustomerSite. Audit-logged.
 */
export async function resetSiteQrToken(siteId: string, actorUserId: string): Promise<string> { ... }

/**
 * Resolves a raw token string to { type, siteName, assetName? }.
 * Returns null for any unrecognised or inactive token.
 * Never returns siteCode, assetTag, internal UUIDs, or customer name.
 */
export async function resolveQrToken(token: string): Promise<{
  type: 'ASSET' | 'SITE';
  siteName: string;
  assetName?: string;
  _internalSiteId: string;   // only used server-side, never sent to client
  _internalAssetId?: string; // only used server-side, never sent to client
} | null> { ... }
```

**`getOrCreateAssetQrToken` logic:**
1. `SELECT id, qrToken FROM assets WHERE id = $assetId AND deletedAt IS NULL FOR UPDATE` inside a transaction.
2. If `qrToken` is non-null, return it.
3. Generate `token = generateToken()`. Retry on unique-constraint violation (max 3 retries).
4. `UPDATE assets SET qrToken = $token WHERE id = $assetId`.
5. `appendAuditLog(tx, { action: 'GENERATED_QR_TOKEN', resource: 'asset', resourceId: assetId, payload: {} })` — do not log the token itself.
6. Return the token.

**`resolveQrToken` logic:**
1. Try `SELECT id, name, siteId, physicalSiteCustomerId, isActive, deletedAt FROM assets WHERE qrToken = $token AND deletedAt IS NULL LIMIT 1`.
2. If found and `isActive = true`: fetch the site name via `SELECT name FROM customer_sites WHERE id = $siteId`. Return `{ type: 'ASSET', siteName, assetName: asset.name, _internalSiteId: siteId, _internalAssetId: asset.id }`.
3. If the asset exists but `isActive = false`, return `null` (same as not-found — no info leak about why).
4. If not found as an asset: try `SELECT id, name, isActive, deletedAt FROM customer_sites WHERE qrToken = $token AND deletedAt IS NULL LIMIT 1`.
5. If found and `isActive = true`: return `{ type: 'SITE', siteName: site.name, _internalSiteId: site.id }`.
6. Any other case: return `null`.

The two lookups are separate queries, not a UNION, so a timing difference between "found inactive" and "not found" is avoided by always returning `null` for the negative case.

**Error handling:**
- Database error during `resolveQrToken`: log with `console.error`, return `null` (fail closed — better to show "not found" than to leak internals).
- Database error during `getOrCreateAssetQrToken`: propagate as a thrown error; the API route catches it and returns `500`.
- Unique constraint retry: catch `P2002` (Prisma unique violation), regenerate token, retry up to 3 times, then throw.

---

## 3. Storage Service Extension (`savePublicRequestPhoto`)

Add a new exported function to the existing `src/lib/services/storageService.ts`. Do not duplicate the validation logic — call the existing `validateImageMagicBytes` (make it exportable or inline a re-use-safe copy) and reuse the `MAX_FILE_SIZE` constant.

```typescript
/**
 * Saves a public-request photo to storage/uploads/public-requests/.
 * Returns an internal storage reference starting with "public-requests/".
 */
export async function savePublicRequestPhoto(fileBuffer: Buffer, mimeType: string): Promise<string> { ... }

/**
 * Resolves a public-request photo storage ref to an absolute path.
 * Enforces that the path stays inside the public-requests subdirectory.
 */
export function getPublicRequestPhotoPath(storageRef: string): string | null { ... }
```

`savePublicRequestPhoto` uses `storage/uploads/public-requests/` as its root. File naming: `pr_<uuidv7>_<timestamp>.<ext>`. Path traversal prevention: same `absolutePath.startsWith(storageRoot)` check as `saveAssetImage`. Storage ref returned: `public-requests/<filename>`.

Validation is identical to `saveAssetImage`: MIME allowlist, size ≤ 5 MB, magic bytes.

---

## 4. API Routes

### 4.1 `GET /api/public/resolve`  _(new)_

File: `src/app/api/public/resolve/route.ts`

```typescript
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim() ?? '';
  if (!token || token.length > 60) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const resolved = await resolveQrToken(token);
  if (!resolved) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({
    type: resolved.type,
    siteName: resolved.siteName,
    assetName: resolved.assetName ?? null,
  });
}
```

The internal `_internalSiteId` and `_internalAssetId` are **not** in the response. The form sends the token back with the final submission; the backend re-resolves it at submission time (the token is the authority, not a client-supplied ID).

**Error handling:** any exception from `resolveQrToken` is caught within the service and returns `null`, which maps to 404 here. No stack traces reach the client.

### 4.2 `POST /api/public/uploads/photo`  _(new)_

File: `src/app/api/public/uploads/photo/route.ts`

```typescript
export async function POST(req: NextRequest) {
  // Rate limit: 5 uploads per IP per 10 minutes
  const clientIp = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const rateCheck = await checkRateLimit(clientIp, 'PUBLIC_PHOTO_UPLOAD', 5, 10);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const formData = await req.formData();
  const file = formData.get('photo');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No photo provided' }, { status: 400 });
  }
  const buffer = Buffer.from(await (file as File).arrayBuffer());
  const mimeType = (file as File).type;

  const storageRef = await savePublicRequestPhoto(buffer, mimeType);
  return NextResponse.json({ storageRef }, { status: 200 });
}
```

**Error handling:**
- `savePublicRequestPhoto` throws `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, or `INVALID_FILE_CONTENT` — these are caught and returned as `400` with the error message.
- `fs.promises.writeFile` failure: caught, returns `500` with generic message.
- No stack trace or filesystem path in any response.

The returned `storageRef` (e.g. `public-requests/pr_<uuid>.jpg`) is an opaque reference. The browser stores it and includes it in the final submission JSON as `photoStorageRef`.

### 4.3 `POST /api/public/requests` _(existing — extend `submitPublicQrRequest`)_

The route handler is already correct. The service function `submitPublicQrRequest` must be updated to accept `token` instead of `siteCode` / `assetTag`, and `photoStorageRef` instead of `photoUrl`. The route handler changes accordingly:

```typescript
// New body fields consumed
const intake = await submitPublicQrRequest({
  token: body.token,                       // was siteCode + assetTag
  requesterName: body.requesterName,
  requesterEmail: body.requesterEmail,
  requesterPhone: body.requesterPhone,
  description: body.description,
  photoStorageRef: body.photoStorageRef,   // was photoUrl (plain string)
  clientIp,
  idempotencyKey: body.idempotencyKey,
});
```

**Updated `submitPublicQrRequest` signature and logic:**

```typescript
export async function submitPublicQrRequest(params: {
  token: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  description: string;
  photoStorageRef?: string;
  clientIp: string;
  idempotencyKey?: string;
})
```

Inside the transaction:

1. **Idempotency check first:** if `params.idempotencyKey`, check `publicRequestIntake.findUnique({ where: { idempotencyKey } })`. If found, return the existing row immediately with no duplicate insert. The route handler returns `201` with the existing intake.

2. **Resolve token:** call `resolveQrToken(params.token)`. If `null` → throw `'INVALID_QR_TOKEN: QR code is not recognised.'`. This replaces the old `findFirst({ where: { siteCode } })` lookup.

3. **Validate photo ref** (if provided): `params.photoStorageRef` must start with `public-requests/`. Reject if it starts with `../`, `assets/`, or any other prefix. This prevents a client from referencing asset images or traversing storage.

4. **Field length validation:**
   - `requesterName`: 1–100 chars.
   - `requesterEmail`: 1–150 chars, must contain `@`.
   - `requesterPhone`: 1–50 chars.
   - `description`: 1–2000 chars.
   - Each failure throws a typed error string starting with the field name.

5. **IP-based rate limit (existing):** the existing `recentSubmissions >= 5` check runs as before. The outer route-handler rate limit (`checkRateLimit` at 10/60min) is a first gate; this per-transaction check is a second gate using raw counts. Keep both.

6. **Create record:** same `publicRequestIntake.create` as before, but `photoUrl` stores `params.photoStorageRef ?? null` (the internal storage ref, not a public URL).

**Error handling (service layer):**
- `INVALID_QR_TOKEN`: non-recoverable for this request; bubbles to route handler, returned as `400`.
- `RATE_LIMIT_EXCEEDED`: returned as `400` from the service (note: the route handler also checks rate limit at `429`; the service check is defence-in-depth).
- Field validation errors: `400`.
- DB unique constraint on `idempotencyKey` (race condition): catch `P2002`, re-query and return existing row (same idempotency logic as the upfront check).
- Unexpected DB error: propagate; route handler catches and returns `500`.

### 4.4 `GET /api/assets/[id]/qr` _(new — staff-authenticated)_

File: `src/app/api/assets/[id]/qr/route.ts`

```typescript
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getOrCreateAssetQrToken(id, user.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return NextResponse.json({ qrUrl: `${appUrl}/request/qr?token=${token}` });
}
```

**Error handling:** asset not found → 404. DB error → 500 with generic message.

### 4.5 `GET /api/customers/[id]/sites/[siteId]/qr` _(new — staff-authenticated)_

File: `src/app/api/customers/[id]/sites/[siteId]/qr/route.ts`

```typescript
export async function GET(req, { params }) {
  const { id, siteId } = await params;
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Verify site belongs to customer
  const site = await prisma.customerSite.findFirst({ where: { id: siteId, customerId: id, deletedAt: null } });
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  const token = await getOrCreateSiteQrToken(siteId, user.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return NextResponse.json({ qrUrl: `${appUrl}/request/qr?token=${token}` });
}
```

### 4.6 `GET /api/requests/intake` _(new — staff-authenticated)_

File: `src/app/api/requests/intake/route.ts`

Lists `PublicRequestIntake` rows with `status = 'RECEIVED'`.

```typescript
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user, 'work_request', 'review') && user.role.name !== 'Admin' && user.role.name !== 'Planner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const intakes = await prisma.publicRequestIntake.findMany({
    where: { status: 'RECEIVED' },
    include: {
      site: { select: { name: true } },
      asset: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ intakes, count: intakes.length });
}
```

**Permission check:** the route uses `hasPermission(user, 'work_request', 'review')` (the existing permission used by `reviewWorkRequest`). It also grants access to roles named `Admin` or `Planner` directly, consistent with how `requireAuth({ roles: ['Admin', 'Planner'] })` works in the codebase.

### 4.7 `POST /api/requests/intake/[id]/process` _(new — staff-authenticated)_

File: `src/app/api/requests/intake/[id]/process/route.ts`

Calls a new service function `processPublicIntake()`. This route handles both rejection and conversion.

```typescript
export async function POST(req: NextRequest, { params }) {
  const { id } = await params;
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user, 'work_request', 'review') && user.role.name !== 'Admin' && user.role.name !== 'Planner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json();
  const result = await processPublicIntake(user, { intakeId: id, action: body.action, rejectionReason: body.rejectionReason });
  return NextResponse.json({ success: true, result });
}
```

### 4.8 `GET /api/public/intake/photo/[...ref]` _(new — staff-authenticated photo serve)_

File: `src/app/api/public/intake/photo/[...ref]/route.ts`

Serves stored public-request photos. Requires a valid staff session. The `[...ref]` catch-all collects the storage-ref path segments.

```typescript
export async function GET(req, { params }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ref = (await params).ref.join('/');
  const absolutePath = getPublicRequestPhotoPath(`public-requests/${ref}`);
  if (!absolutePath) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  
  const buffer = await fs.promises.readFile(absolutePath);
  const ext = path.extname(absolutePath).slice(1);
  const contentType = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';
  return new NextResponse(buffer, {
    status: 200,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
  });
}
```

Path traversal prevention: `getPublicRequestPhotoPath` already enforces that the resolved path starts within the `public-requests/` directory. The catch-all segments are joined but then immediately handed to the safe resolver, which applies `path.basename` and the directory prefix check.

---

## 5. `processPublicIntake` Service Function

New function in `src/lib/services/portalService.ts`:

```typescript
export async function processPublicIntake(
  user: AuthenticatedUser,
  params: {
    intakeId: string;
    action: 'REJECT' | 'CONVERT_TO_WORK_REQUEST' | 'CONVERT_TO_WORK_ORDER';
    rejectionReason?: string;
  }
)
```

Logic (runs in a Prisma transaction with `SELECT … FOR UPDATE` on the intake row):

1. `SELECT id, status, processedRequestId, siteId, assetId, description FROM public_request_intake WHERE id = $intakeId FOR UPDATE`.
2. If not found → throw `'INTAKE_NOT_FOUND'`.
3. If `processedRequestId IS NOT NULL` → throw `'INTAKE_ALREADY_PROCESSED: This intake has already been processed.'`.
4. If `status != 'RECEIVED'` → throw `'INTAKE_NOT_RECEIVABLE: Intake is not in RECEIVED status.'`.

**REJECT path:**
1. `UPDATE public_request_intake SET status = 'REJECTED', rejectionReason = $reason WHERE id = $intakeId AND processedRequestId IS NULL`.
2. `appendAuditLog(tx, { action: 'REJECTED_PUBLIC_INTAKE', resource: 'public_request_intake', resourceId: intakeId, payload: { reason } })`.
3. Return `{ intake: updatedRow }`.

**CONVERT_TO_WORK_REQUEST path:**
1. Determine `branchId`: query `SELECT managingBranchId, branchId FROM assets WHERE id = $assetId` (if assetId present) OR `SELECT managingBranchId FROM customer_sites WHERE id = $siteId`. Use the first non-null branch found, falling back to `user.branchId`.
2. Call `createWorkRequest(user, { title: 'Public QR Report: ' + description.slice(0,80), description, assetId, branchId, priority: 'MEDIUM' })` — this uses the existing service, so audit log and notification are emitted automatically.
3. `UPDATE public_request_intake SET status = 'PROCESSED', processedRequestId = $workRequest.id WHERE id = $intakeId AND processedRequestId IS NULL`. If 0 rows updated (concurrent race), throw `'INTAKE_ALREADY_PROCESSED'`.
4. `appendAuditLog(tx, { action: 'CONVERTED_PUBLIC_INTAKE_TO_WORK_REQUEST', resource: 'public_request_intake', resourceId: intakeId, payload: { workRequestId } })`.

**CONVERT_TO_WORK_ORDER path:**
1. Same branch determination as above.
2. Call `createWorkOrder(user, { title, description, assetId, branchId, type: 'CORRECTIVE', priority: 'MEDIUM', customerId, siteId })` from `workOrderService.ts`. Existing service emits its own audit log.
3. `UPDATE public_request_intake SET status = 'PROCESSED', processedRequestId = $wo.id WHERE id = $intakeId AND processedRequestId IS NULL`. Same race guard.
4. `appendAuditLog(tx, { action: 'CONVERTED_PUBLIC_INTAKE_TO_WORK_ORDER', resource: 'public_request_intake', resourceId: intakeId, payload: { workOrderId } })`.

**Branch determination:** `Customer` → `CustomerSite` does not have a `branchId` column in the current schema (it is a customer-facing entity, not an internal branch entity). Assets can have `branchId` (physical branch) or `managingBranchId`. When converting, use `asset.branchId ?? asset.managingBranchId ?? user.branchId`. If the intake has no asset, use `user.branchId` as the fallback. The Planner owns the resulting WorkRequest/WorkOrder with their branch scope; this is intentional and matches how the existing `createWorkRequest` already works (it uses `user.branchId` as the initial `branchId`).

**Error handling:**
- `INTAKE_NOT_FOUND`: HTTP 404.
- `INTAKE_ALREADY_PROCESSED`: HTTP 400.
- `createWorkRequest` / `createWorkOrder` failure: propagate; transaction rolls back; intake remains in `RECEIVED`.
- `WORK_ORDER_ASSIGNED` notification failure (inside `createWorkOrder`): the existing service has notification errors already; they don't roll back the transaction in the current implementation, so behaviour is consistent.

---

## 6. Middleware Update

**File:** `src/middleware.ts` — add two entries to `PUBLIC_PATHS`:

```typescript
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/demo-session',
  '/api/auth/me',
  '/api/auth/verify-otp',
  '/api/auth/resend-otp',
  '/api/health',
  '/request/qr',              // ADD: public QR form page
  '/api/public/',             // ADD: covers /api/public/requests, /api/public/resolve, /api/public/uploads/photo
];
```

The existing check at line 90 is `PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))`. Adding `/api/public/` with a trailing slash means the `startsWith('/api/public/')` check passes for all sub-paths. No other middleware logic changes.

The `GET /api/public/intake/photo/[...ref]` route is **not** in `PUBLIC_PATHS`; it goes through the existing `if (pathname.startsWith('/api/')) return response` fast-path after security headers, which allows all API routes through — session enforcement is done inside the route handler with `getCurrentUser(req)`.

**CSRF:** `POST /api/public/requests` and `POST /api/public/uploads/photo` are served from the same origin as the QR form page (`/request/qr` is served by the same Next.js app). Browser sends the `origin` header matching the app URL, which is a trusted origin. No CSRF exemption is needed.

---

## 7. QR Form Page (`src/app/request/qr/page.tsx`)

The page is a `'use client'` component. It is fully rewritten to use the token flow:

```
Page load:
  1. Read `token` from `useSearchParams().get('token')`.
  2. If no token: show "Invalid QR code" error state.
  3. Call `GET /api/public/resolve?token=<token>` on mount.
     - 200: store { siteName, assetName, type } in state; show pre-populated banner.
     - 404: show "QR code not recognised" error state; form is not rendered.
     - Network error: show "Service unavailable" error state.

Photo upload flow:
  - User picks a file via <input type="file" accept="image/jpeg,image/png,image/webp">.
  - On change: POST the file to /api/public/uploads/photo.
  - On success: store `storageRef` in state.
  - Show upload progress / success badge.
  - On error: show inline error; clear the file input.

Form submission:
  - Validate client-side: all required fields non-empty.
  - Generate idempotency key with `crypto.randomUUID()`.
  - POST /api/public/requests with { token, requesterName, requesterEmail, requesterPhone, description, photoStorageRef, idempotencyKey }.
  - On 201: show confirmation screen (no internal IDs shown).
  - On 429: "Too many reports. Please try again later."
  - On 400 with field-specific messages: highlight fields.
  - On 500: "Something went wrong. Please try again."
```

The form never shows `siteCode`, `assetTag`, or any UUID to the user. It shows only the resolved `siteName` (and `assetName` if applicable) in a read-only banner.

**Visual identity:** existing style from the current `page.tsx` is preserved — Navy `#080E29` background (which is the existing color in the file; `#0B1336` was the target but `#080E29` is what's used — keep existing), Orange `#FF5B00`, white card, `rounded-2xl`, `shadow-2xl`. The existing CSS class strings are reused verbatim.

**Mobile responsiveness:** existing layout (`max-w-md w-full`, single-column form, `grid grid-cols-2 gap-3` for name/phone) is maintained. Photo upload uses a standard `<input type="file">` which is natively mobile-friendly.

**QR code display for staff:** a small `QrCodeDisplay` client component is added to the asset detail page and customer site detail page. It calls `GET /api/assets/[id]/qr` or `GET /api/customers/[id]/sites/[siteId]/qr` to get the URL, then renders a QR code using the [`qrcode`](https://npmjs.com/package/qrcode) library. Since `qrcode` is not in `package.json`, the implementation uses a lightweight alternative: render the QR URL as text that staff can scan via browser-native QR support, or use the `<img>` trick with a free public QR API (`api.qrserver.com`) with the URL passed as a parameter. **Decision:** use `qrserver.com` for the first version since it requires no new package and no backend image generation. The staff UI sends a GET to `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=<encodedUrl>` to render the image client-side. The URL is encoded with `encodeURIComponent`. A "Print" button triggers `window.print()`. This is entirely client-side — no new backend image-generation service is needed.

This approach is chosen over adding the `qrcode` npm package because: (1) it avoids a new dependency and a package install step, (2) the external call happens only in the authenticated staff UI, not in the public-facing path, and (3) the QR image is display-only and not security-sensitive.

---

## 8. Planner Review UI

A new page `src/app/requests/intake/page.tsx` (or a new tab within `src/app/requests/page.tsx`). **Decision: separate page at `/requests/intake`** for two reasons: (1) it keeps the existing `/requests/page.tsx` unchanged (no risk of regression), and (2) it gives Planners a dedicated URL they can bookmark.

The page fetches from `GET /api/requests/intake` and displays a table with: timestamp, requester name, site name, asset name, description excerpt, status badge. Clicking a row expands a detail panel showing full requester info, description, photo (served via `GET /api/public/intake/photo/…`), and action buttons: **Convert to Work Request**, **Convert to Work Order**, **Reject** (with a reason input).

The page is a `'use client'` component following the exact same pattern as `src/app/requests/page.tsx` (table + action buttons + inline form). It does not introduce any new UI libraries.

**Navigation:** a link to `/requests/intake` is added to the application sidebar (`src/components/layout/AppSidebar.tsx` or whichever sidebar component is active). The link is conditionally rendered based on `hasPermission(user, 'work_request', 'review')` — the same permission already used in the backend.

---

## 9. Files Modified / Created

| File | Action | Purpose |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `qrToken` to `Asset` and `CustomerSite`; add `rejectionReason` to `PublicRequestIntake`; add Prisma relations for the two new columns |
| `prisma/migrations/…_r1_qr_tokens/migration.sql` | Create | DDL for 3 new columns + indexes |
| `src/lib/services/qrTokenService.ts` | Create | Token generation, resolution, reset |
| `src/lib/services/storageService.ts` | Modify | Add `savePublicRequestPhoto`, `getPublicRequestPhotoPath` |
| `src/lib/services/portalService.ts` | Modify | Update `submitPublicQrRequest` to accept `token` + `photoStorageRef`; add `processPublicIntake` |
| `src/middleware.ts` | Modify | Add `/request/qr` and `/api/public/` to `PUBLIC_PATHS` |
| `src/app/request/qr/page.tsx` | Rewrite | Token-based form with photo upload and proper error states |
| `src/app/api/public/resolve/route.ts` | Create | `GET /api/public/resolve` — anonymous token resolution |
| `src/app/api/public/uploads/photo/route.ts` | Create | `POST /api/public/uploads/photo` — anonymous photo upload |
| `src/app/api/public/requests/route.ts` | Modify | Pass `token` and `photoStorageRef` from body to service |
| `src/app/api/public/intake/photo/[...ref]/route.ts` | Create | Staff-authenticated photo serve |
| `src/app/api/assets/[id]/qr/route.ts` | Create | Staff-authenticated QR URL generation for assets |
| `src/app/api/customers/[id]/sites/[siteId]/qr/route.ts` | Create | Staff-authenticated QR URL generation for sites |
| `src/app/api/requests/intake/route.ts` | Create | `GET /api/requests/intake` — Planner listing |
| `src/app/api/requests/intake/[id]/process/route.ts` | Create | `POST /api/requests/intake/[id]/process` — reject / convert |
| `src/app/requests/intake/page.tsx` | Create | Planner review UI |
| `src/components/layout/AppSidebar.tsx` (or equivalent) | Modify | Add link to `/requests/intake` |
| `src/lib/services/qrTokenService.test.ts` | Create | Tests AC-3 to AC-6 |
| `src/lib/services/storageService.test.ts` _(extend existing)_ | Modify | Tests AC-8 public photo variant |
| `src/lib/services/portalService.test.ts` | Create | Tests AC-2, AC-7, AC-9, AC-10, AC-14 |
| `src/tests/middleware/qrPublicAccess.test.ts` | Create | Tests AC-1 |
| `src/tests/api/plannerIntake.test.ts` | Create | Tests AC-11 to AC-15 |
| `src/tests/api/workOrderUnaffected.test.ts` | Create | Tests AC-16 |

The PWA files (`src/lib/pwa/`, `src/tests/pwa/`) are not touched.

---

## 10. Validation Rules Summary

| Input | Layer | Rule | Failure Behaviour |
|---|---|---|---|
| `token` (resolve) | API + service | Present, ≤ 60 chars | 404 with "Not found" |
| `token` (submit) | Service | Resolves to active site/asset | 400 `INVALID_QR_TOKEN` |
| `requesterName` | Service | 1–100 chars | 400 field error |
| `requesterEmail` | Service | 1–150 chars, contains `@` | 400 field error |
| `requesterPhone` | Service | 1–50 chars | 400 field error |
| `description` | Service | 1–2000 chars | 400 field error |
| `photoStorageRef` | Service | Starts with `public-requests/`, no traversal | 400 field error |
| Photo file (upload) | `savePublicRequestPhoto` | MIME allowlist, ≤ 5 MB, magic bytes | 400 from route handler |
| `intakeId` (process) | Service | Exists, not already processed | 404 / 400 |
| `rejectionReason` (reject) | Service | Present if action is REJECT (1–1000 chars) | 400 |

---

## 11. Security Controls Checklist

- `/request/qr` and `/api/public/…` are anonymous — handled by `PUBLIC_PATHS` extension. No other routes are loosened.
- `GET /api/public/resolve` returns only `siteName` and `assetName`; no IDs, codes, or customer names.
- Same `404` body for "not found" and "inactive" in `resolveQrToken` — no information leakage.
- Photo serve endpoint (`/api/public/intake/photo/…`) requires a valid staff session via `getCurrentUser`.
- QR tokens are `crypto.randomBytes(32)` base64url — 256 bits of entropy; not derivable from any public attribute.
- Storage refs for public photos are stored in a separate directory (`public-requests/`) from asset images, with path traversal prevention on both write (storage service) and read (serve route).
- Rate limits: 10 submissions/60 min per IP (outer), 5/60 min per IP (inner service), 5 photo uploads/10 min per IP.
- CSRF: public POST endpoints originate from the same-origin app — the middleware CSRF check passes normally (no exemption needed).
- Existing staff API routes, auth cookie logic, and all existing middleware checks are unchanged.

---

## 12. Testability

Each layer is independently testable:

- **`qrTokenService`**: unit-tested with a mocked Prisma client (spy on `prisma.asset.update`, `prisma.customerSite.update`, `prisma.asset.findFirst`, `prisma.customerSite.findFirst`). No DB connection required. Tests AC-3, AC-4, AC-5, AC-6.
- **`storageService` additions**: unit-tested with real filesystem writes to a temp directory (same pattern as existing `assetImage.test.ts`). Tests AC-8.
- **`portalService`** (`submitPublicQrRequest`, `processPublicIntake`): unit-tested with a mocked Prisma client. The token-resolution call is mocked via `vi.mock('./qrTokenService')`. Tests AC-2, AC-7, AC-9, AC-14.
- **Middleware**: unit-tested following the existing `csrfOrigin.test.ts` pattern (import `middleware`, construct a `NextRequest`, assert response status). Tests AC-1.
- **API route handlers** (`/api/requests/intake`, `/api/requests/intake/[id]/process`): unit-tested with mocked `getCurrentUser` and mocked service functions. Tests AC-11, AC-12, AC-15.
- **Workflow integration** (AC-13, AC-16): tested against `zemifix_dev` using the same pattern as `test_stage_r1_portal_quotes.ts` (a `scripts/` integration test). Never touches `zemifix_acceptance`.
