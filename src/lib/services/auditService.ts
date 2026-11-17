import crypto from 'crypto';
import { prisma } from '../prisma';
import { canonicalizeJson } from './canonicalJson';
import { generateUuidV7 } from '../uuid';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const AUDIT_ADVISORY_LOCK_ID = 19842026;

export interface AuditEntryInput {
  actorUserId?: string | null;
  action: string;
  resource: string;
  resourceId: string;
  payload: Record<string, unknown>;
}

export async function appendAuditLog(
  client: any,
  input: AuditEntryInput
): Promise<{ sequenceNumber: bigint; hash: string }> {
  const executeAuditAppend = async (tx: any) => {
    // 1. Transaction-level advisory lock via $executeRaw (serializes sequence allocation)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_ADVISORY_LOCK_ID})`;

    // 2. Retrieve last sequence number and hash using numeric BigInt ordering
    const [lastAudit] = await tx.$queryRaw<Array<{ sequenceNumber: string; hash: string }>>`
      SELECT "sequenceNumber"::text as "sequenceNumber", hash
        FROM "audit_logs"
       ORDER BY "sequenceNumber"::bigint DESC
       LIMIT 1
    `;

    const sequenceNumber = lastAudit ? BigInt(lastAudit.sequenceNumber) + 1n : 1n;
    const prevHash = lastAudit ? lastAudit.hash : GENESIS_HASH;
    const now = new Date();
    const auditUuid = generateUuidV7();

    // 3. Construct Named Canonical Audit Payload for Hash Calculation
    const auditCanonicalObject = {
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      createdAt: now.toISOString(),
      payload: input.payload,
      prevHash,
      resource: input.resource,
      resourceId: input.resourceId,
      sequenceNumber: sequenceNumber.toString(),
    };

    const canonicalPayloadString = canonicalizeJson(auditCanonicalObject);
    const hash = crypto.createHash('sha256').update(canonicalPayloadString).digest('hex');

    const jsonbPayloadString = canonicalizeJson(input.payload);

    // 4. Raw SQL Insert with Explicit sequenceNumber inside the SAME transaction
    await tx.$executeRaw`
      INSERT INTO "audit_logs" (
        "sequenceNumber", "id", "actorUserId", "action", "resource", "resourceId", "payload", "prevHash", "hash", "createdAt"
      ) VALUES (
        ${sequenceNumber},
        ${auditUuid}::uuid,
        ${input.actorUserId ? input.actorUserId : null}::uuid,
        ${input.action},
        ${input.resource},
        ${input.resourceId},
        ${jsonbPayloadString}::jsonb,
        ${prevHash},
        ${hash},
        ${now}
      )
    `;

    return { sequenceNumber, hash };
  };

  if (typeof client.$transaction === 'function') {
    // Client is the root Prisma instance; wrap in an explicit transaction to keep advisory lock held
    return client.$transaction(async (innerTx: any) => executeAuditAppend(innerTx));
  } else {
    // Client is already an active transaction client
    return executeAuditAppend(client);
  }
}

export async function verifyAuditChain(): Promise<{ valid: boolean; brokenAtSequence?: bigint }> {
  const logs = await prisma.auditLog.findMany({
    orderBy: { sequenceNumber: 'asc' },
  });

  let expectedSequenceNumber = 1n;
  let expectedPrevHash = GENESIS_HASH;

  for (const entry of logs) {
    if (entry.sequenceNumber !== expectedSequenceNumber) {
      return { valid: false, brokenAtSequence: entry.sequenceNumber };
    }

    const auditCanonicalObject = {
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      createdAt: entry.createdAt.toISOString(),
      payload: entry.payload as Record<string, unknown>,
      prevHash: expectedPrevHash,
      resource: entry.resource,
      resourceId: entry.resourceId,
      sequenceNumber: entry.sequenceNumber.toString(),
    };

    const recalculatedHash = crypto
      .createHash('sha256')
      .update(canonicalizeJson(auditCanonicalObject))
      .digest('hex');

    if (recalculatedHash !== entry.hash || entry.prevHash !== expectedPrevHash) {
      return { valid: false, brokenAtSequence: entry.sequenceNumber };
    }

    expectedPrevHash = entry.hash;
    expectedSequenceNumber += 1n;
  }

  return { valid: true };
}

import fs from 'fs';
import path from 'path';
import { LocalDiskAnchorRepository, S3WormAnchorRepository, AuditAnchorSnapshot } from './auditExternalRepository';

export interface AuditAnchorResult {
  anchorDate: string;
  sequenceNumber: bigint;
  headHash: string;
  entryCount: bigint;
  keyVersion: string;
  anchorSignature: string;
  anchoredAt: Date;
}

/**
 * Resolves the dedicated AUDIT_ANCHOR_SIGNING_KEY for a given keyVersion.
 * Never falls back to SESSION_SECRET. Throws error if key is missing or < 32 chars.
 */
export function getAuditAnchorSigningKey(keyVersion = 'v1'): string {
  const envVarName = keyVersion === 'v1'
    ? 'AUDIT_ANCHOR_SIGNING_KEY'
    : `AUDIT_ANCHOR_SIGNING_KEY_${keyVersion.toUpperCase()}`;

  const key = process.env[envVarName] || process.env.AUDIT_ANCHOR_SIGNING_KEY;

  if (!key || typeof key !== 'string' || key.trim().length < 32) {
    throw new Error(
      `AUDIT_ANCHOR_KEY_INVALID: Dedicated signing key '${envVarName}' is missing or fewer than 32 characters long. SESSION_SECRET fallback is strictly prohibited.`
    );
  }

  return key.trim();
}

/**
 * Computes an independent daily head hash anchor for the audit chain.
 * Stores the anchor row in 'audit_anchors' table AND uploads to external repository adapters.
 */
export async function anchorDailyHeadHash(
  client: any = prisma,
  targetDate?: Date,
  externalRepoDir = 'backups/audit_anchors',
  overrideKeyVersion?: string
): Promise<AuditAnchorResult> {
  const d = targetDate ?? new Date();
  const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
  const keyVersion = overrideKeyVersion || process.env.AUDIT_ANCHOR_KEY_VERSION || 'v1';

  // Obtain dedicated signing key (no SESSION_SECRET fallback)
  const signingKey = getAuditAnchorSigningKey(keyVersion);

  // Check existing anchor in PostgreSQL table to prevent silent overwrite of published historical anchors
  const anchorDateObj = new Date(`${dateStr}T00:00:00.000Z`);
  const [existingAnchor] = await client.$queryRaw<Array<{ sequenceNumber: string; headHash: string }>>`
    SELECT "sequenceNumber"::text as "sequenceNumber", "headHash"
      FROM "audit_anchors"
     WHERE "anchorDate" = ${anchorDateObj}::date
  `;

  // Query current head log as of target date end
  const [headLog] = await client.$queryRaw<Array<{ sequenceNumber: string; hash: string }>>`
    SELECT "sequenceNumber"::text as "sequenceNumber", hash
      FROM "audit_logs"
     WHERE "createdAt" <= ${endOfDay}
     ORDER BY "sequenceNumber"::bigint DESC
     LIMIT 1
  `;

  // Total count as of end of target date
  const [countRes] = await client.$queryRaw<Array<{ count: string }>>`
    SELECT COUNT(*)::text as count
      FROM "audit_logs"
     WHERE "createdAt" <= ${endOfDay}
  `;

  const sequenceNumber = headLog ? BigInt(headLog.sequenceNumber) : 0n;
  const headHash = headLog ? headLog.hash : GENESIS_HASH;
  const entryCount = countRes ? BigInt(countRes.count) : 0n;

  // Historical Anchor Overwrite Protection Assertion
  if (existingAnchor) {
    if (existingAnchor.headHash !== headHash || existingAnchor.sequenceNumber !== sequenceNumber.toString()) {
      throw new Error(
        `AUDIT_ANCHOR_CONFLICT: Published historical anchor for date ${dateStr} (headHash: ${existingAnchor.headHash}) cannot be overwritten with conflicting payload (headHash: ${headHash}).`
      );
    }
  }

  // Construct canonical anchor object for HMAC SHA-256 signature
  const anchorCanonicalObject = {
    anchorDate: dateStr,
    entryCount: entryCount.toString(),
    headHash,
    keyVersion,
    sequenceNumber: sequenceNumber.toString(),
  };

  const canonicalStr = canonicalizeJson(anchorCanonicalObject);
  const anchorSignature = crypto.createHmac('sha256', signingKey).update(canonicalStr).digest('hex');

  // Upsert into audit_anchors PostgreSQL table
  await client.$executeRaw`
    INSERT INTO "audit_anchors" ("anchorDate", "sequenceNumber", "headHash", "entryCount", "keyVersion", "anchorSignature", "anchoredAt")
    VALUES (${anchorDateObj}::date, ${sequenceNumber}, ${headHash}, ${entryCount}, ${keyVersion}, ${anchorSignature}, NOW())
    ON CONFLICT ("anchorDate") DO UPDATE
    SET "sequenceNumber" = EXCLUDED."sequenceNumber",
        "headHash" = EXCLUDED."headHash",
        "entryCount" = EXCLUDED."entryCount",
        "keyVersion" = EXCLUDED."keyVersion",
        "anchorSignature" = EXCLUDED."anchorSignature",
        "anchoredAt" = NOW();
  `;

  const snapshotPayload: AuditAnchorSnapshot = {
    ...anchorCanonicalObject,
    anchorSignature,
    anchoredAt: new Date().toISOString(),
  };

  // Upload to local disk secondary diagnostic repo
  const localRepo = new LocalDiskAnchorRepository(externalRepoDir);
  await localRepo.uploadSnapshot(snapshotPayload);

  // Upload to offsite S3 WORM repository adapter (if configured)
  const s3Repo = new S3WormAnchorRepository();
  if (s3Repo.isConfigured) {
    await s3Repo.uploadSnapshot(snapshotPayload);
  }

  return {
    anchorDate: dateStr,
    sequenceNumber,
    headHash,
    entryCount,
    keyVersion,
    anchorSignature,
    anchoredAt: new Date(),
  };
}

/**
 * Verifies a daily head hash anchor against the live audit chain, stored keyVersion, and HMAC signature.
 */
export async function verifyDailyAnchor(
  anchorDate: Date,
  client: any = prisma,
  customKeyVersionMap?: Record<string, string>
): Promise<{ valid: boolean; reason?: string }> {
  const dateStr = anchorDate.toISOString().split('T')[0];
  const anchorDateObj = new Date(`${dateStr}T00:00:00.000Z`);

  const [anchorRow] = await client.$queryRaw<Array<{ anchorDate: Date; sequenceNumber: string; headHash: string; entryCount: string; keyVersion: string; anchorSignature: string }>>`
    SELECT "anchorDate", "sequenceNumber"::text as "sequenceNumber", "headHash", "entryCount"::text as "entryCount", "keyVersion", "anchorSignature"
      FROM "audit_anchors"
     WHERE "anchorDate" = ${anchorDateObj}::date
  `;

  if (!anchorRow) {
    return { valid: false, reason: `No audit anchor found for date ${dateStr}` };
  }

  const keyVer = anchorRow.keyVersion || 'v1';

  // Resolve key for keyVersion
  let signingKey = '';
  if (customKeyVersionMap && customKeyVersionMap[keyVer]) {
    signingKey = customKeyVersionMap[keyVer];
  } else {
    try {
      signingKey = getAuditAnchorSigningKey(keyVer);
    } catch (e: any) {
      return { valid: false, reason: `Cannot verify anchor: ${e.message}` };
    }
  }

  // 1. Verify HMAC Signature
  const anchorCanonicalObject = {
    anchorDate: dateStr,
    entryCount: anchorRow.entryCount,
    headHash: anchorRow.headHash,
    keyVersion: keyVer,
    sequenceNumber: anchorRow.sequenceNumber,
  };

  const expectedSig = crypto.createHmac('sha256', signingKey).update(canonicalizeJson(anchorCanonicalObject)).digest('hex');

  if (expectedSig !== anchorRow.anchorSignature) {
    return { valid: false, reason: `Anchor signature mismatch for date ${dateStr} (keyVersion: ${keyVer})` };
  }

  // 2. Verify Complete Audit Hash Chain from Sequence #1 up to sequenceNumber
  const seqNum = BigInt(anchorRow.sequenceNumber);
  if (seqNum > 0n) {
    const logs = await client.$queryRaw<Array<{ sequenceNumber: string; hash: string; prevHash: string; action: string; actorUserId: string | null; resource: string; resourceId: string; payload: any; createdAt: Date }>>`
      SELECT "sequenceNumber"::text as "sequenceNumber", hash, "prevHash", action, "actorUserId"::text as "actorUserId", resource, "resourceId", payload, "createdAt"
        FROM "audit_logs"
       WHERE "sequenceNumber"::bigint <= ${seqNum}
       ORDER BY "sequenceNumber"::bigint ASC
    `;

    if (logs.length === 0) {
      return { valid: false, reason: `Audit log at sequence #${seqNum} missing from database` };
    }

    let expectedSeq = 1n;
    let expectedPrevHash = GENESIS_HASH;

    for (const entry of logs) {
      const currentSeq = BigInt(entry.sequenceNumber);
      if (currentSeq !== expectedSeq) {
        return { valid: false, reason: `Audit chain sequence gap at #${currentSeq} (expected #${expectedSeq})` };
      }

      if (entry.prevHash !== expectedPrevHash) {
        return { valid: false, reason: `PrevHash mismatch at sequence #${currentSeq}` };
      }

      const auditCanonicalObject = {
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        createdAt: new Date(entry.createdAt).toISOString(),
        payload: entry.payload,
        prevHash: expectedPrevHash,
        resource: entry.resource,
        resourceId: entry.resourceId,
        sequenceNumber: currentSeq.toString(),
      };

      const recalculatedHash = crypto.createHash('sha256').update(canonicalizeJson(auditCanonicalObject)).digest('hex');

      if (recalculatedHash !== entry.hash) {
        return { valid: false, reason: `Payload/hash mismatch at audit log sequence #${currentSeq}` };
      }

      expectedPrevHash = entry.hash;
      expectedSeq += 1n;
    }

    // Verify head hash matches anchored head hash
    const headRow = logs[logs.length - 1];
    if (headRow.hash !== anchorRow.headHash) {
      return { valid: false, reason: `Database hash at sequence #${seqNum} (${headRow.hash}) does not match anchored head hash (${anchorRow.headHash})` };
    }
  }

  return { valid: true };
}
