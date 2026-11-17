import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { appendAuditLog, anchorDailyHeadHash, verifyDailyAnchor, verifyAuditChain, getAuditAnchorSigningKey } from './auditService';
import { LocalDiskAnchorRepository, S3WormAnchorRepository } from './auditExternalRepository';

const accDbUrl = 'postgresql://postgres:javvy@localhost:5432/zemifix_acceptance?schema=public';
const prisma = new PrismaClient({
  datasources: { db: { url: accDbUrl } },
});

const TEST_SIGNING_KEY_V1 = 'test-dedicated-audit-anchor-signing-key-32chars!';
const TEST_SIGNING_KEY_V2 = 'rotated-v2-audit-anchor-signing-key-at-least-32chars!';

describe('Audit Chain Daily Anchoring, Dedicated Key & Independence (Sub-stage 1.2)', () => {
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    const res = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    if (res[0]?.current_database !== 'zemifix_acceptance') {
      throw new Error(`Test MUST run against zemifix_acceptance! Found: ${res[0]?.current_database}`);
    }
  });

  beforeEach(() => {
    process.env.AUDIT_ANCHOR_SIGNING_KEY = TEST_SIGNING_KEY_V1;
    process.env.AUDIT_ANCHOR_SIGNING_KEY_V2 = TEST_SIGNING_KEY_V2;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('requires dedicated AUDIT_ANCHOR_SIGNING_KEY and throws error when missing or short', () => {
    delete process.env.AUDIT_ANCHOR_SIGNING_KEY;
    expect(() => getAuditAnchorSigningKey('v1')).toThrowError(/AUDIT_ANCHOR_KEY_INVALID/);

    process.env.AUDIT_ANCHOR_SIGNING_KEY = 'too-short';
    expect(() => getAuditAnchorSigningKey('v1')).toThrowError(/AUDIT_ANCHOR_KEY_INVALID/);
  });

  it('computes daily head hash anchor using dedicated signing key and keyVersion v1', async () => {
    const auditRes = await appendAuditLog(prisma, {
      action: 'SUBSTAGE_1_2_ACTION',
      resource: 'test_resource_12',
      resourceId: 'res-12',
      payload: { stage: '1.2' },
    });

    const uniqueId = Math.floor(Math.random() * 10000);
    const testDate = new Date(`2028-01-01T12:00:00Z`);
    testDate.setUTCDate(testDate.getUTCDate() + (uniqueId % 100));

    const anchorRes = await anchorDailyHeadHash(prisma, testDate, 'backups/test_audit_anchors_v1', 'v1');

    expect(anchorRes.keyVersion).toBe('v1');
    expect(anchorRes.anchorSignature).toHaveLength(64);

    const verifyRes = await verifyDailyAnchor(testDate, prisma);
    expect(verifyRes.valid).toBe(true);
  });

  it('supports key rotation with keyVersion v2 and verifies historical anchors using rotation map', async () => {
    const uniqueId = Math.floor(Math.random() * 10000);
    const testDateV2 = new Date(`2028-06-01T12:00:00Z`);
    testDateV2.setUTCDate(testDateV2.getUTCDate() + (uniqueId % 100));

    // Anchor using v2 key
    const anchorResV2 = await anchorDailyHeadHash(prisma, testDateV2, 'backups/test_audit_anchors_v2', 'v2');
    expect(anchorResV2.keyVersion).toBe('v2');

    // Verify using historical key map
    const customKeyMap = {
      v1: TEST_SIGNING_KEY_V1,
      v2: TEST_SIGNING_KEY_V2,
    };

    const verifyRes = await verifyDailyAnchor(testDateV2, prisma, customKeyMap);
    expect(verifyRes.valid).toBe(true);
  });

  it('prevents silent overwrite of established historical anchor with conflicting payload', async () => {
    const offsetDays = Math.floor(Math.random() * 500) + 500;
    const conflictDate = new Date(Date.now() + offsetDays * 86400000);

    // First publication
    await anchorDailyHeadHash(prisma, conflictDate, 'backups/test_audit_anchors_conflict', 'v1');

    // Insert new audit log AFTER anchor was published
    await appendAuditLog(prisma, {
      action: 'NEW_LOG_AFTER_ANCHOR',
      resource: 'test',
      resourceId: '123',
      payload: { new: true },
    });

    // Re-anchoring for the SAME date with different headHash must throw AUDIT_ANCHOR_CONFLICT error
    await expect(
      anchorDailyHeadHash(prisma, conflictDate, 'backups/test_audit_anchors_conflict', 'v1')
    ).rejects.toThrowError(/AUDIT_ANCHOR_CONFLICT/);
  });

  it('verifies LocalDiskAnchorRepository and S3WormAnchorRepository provider status', async () => {
    const localRepo = new LocalDiskAnchorRepository('backups/test_repo');
    expect(localRepo.isConfigured).toBe(true);
    expect(localRepo.providerName).toBe('LocalDiskStorage');

    const s3Repo = new S3WormAnchorRepository();
    expect(s3Repo.providerName).toBe('S3ObjectLockWORM');
    // In test environment without S3 AWS env vars, isConfigured evaluates to false
    expect(s3Repo.isConfigured).toBe(false);

    const snapshot = {
      anchorDate: '2026-11-23',
      sequenceNumber: '10',
      headHash: '0000000000000000000000000000000000000000000000000000000000000000',
      entryCount: '10',
      keyVersion: 'v1',
      anchorSignature: '0000000000000000000000000000000000000000000000000000000000000000',
      anchoredAt: new Date().toISOString(),
    };

    const s3Res = await s3Repo.uploadSnapshot(snapshot);
    expect(s3Res.success).toBe(false);
    expect(s3Res.location).toContain('UNCONFIGURED_EXTERNAL_STORAGE');
  });
});
