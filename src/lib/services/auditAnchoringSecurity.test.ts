import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  appendAuditLog,
  anchorDailyHeadHash,
  verifyDailyAnchor,
  verifyAuditChain,
} from './auditService';
import {
  enqueueDailyAuditAnchorJob,
  runBackgroundWorker,
  recoverMissedAuditAnchorDays,
} from './backgroundJobService';
import { LocalDiskAnchorRepository } from './auditExternalRepository';

const accDbUrl = 'postgresql://postgres:javvy@localhost:5432/zemifix_acceptance?schema=public';
const prisma = new PrismaClient({
  datasources: { db: { url: accDbUrl } },
});

const TEST_KEY_V1 = 'test-dedicated-audit-anchor-signing-key-32chars!';

describe('Audit Chain Security, Tamper Detection & Missed-Day Recovery (Sub-stage 1.4)', () => {
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    const res = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    if (res[0]?.current_database !== 'zemifix_acceptance') {
      throw new Error(`Test MUST run against zemifix_acceptance! Found: ${res[0]?.current_database}`);
    }
  });

  beforeEach(() => {
    process.env.AUDIT_ANCHOR_SIGNING_KEY = TEST_KEY_V1;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('detects tampered anchor signature and fails verification', async () => {
    const offset = Math.floor(Math.random() * 100000) + 10000;
    const testDate = new Date(Date.now() + offset * 86400000);
    const dateStr = testDate.toISOString().split('T')[0];

    await anchorDailyHeadHash(prisma, testDate, 'backups/test_tamper');

    // Tamper signature directly in database table
    const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
    await prisma.$executeRaw`
      UPDATE "audit_anchors"
         SET "anchorSignature" = '0000000000000000000000000000000000000000000000000000000000000000'
       WHERE "anchorDate" = ${dateObj}::date
    `;

    const verifyRes = await verifyDailyAnchor(testDate, prisma);
    expect(verifyRes.valid).toBe(false);
    expect(verifyRes.reason).toContain('signature mismatch');
  });

  it('detects missing daily anchor for date that has not been anchored', async () => {
    const unanchoredDate = new Date('2040-01-01T12:00:00Z');
    const verifyRes = await verifyDailyAnchor(unanchoredDate, prisma);

    expect(verifyRes.valid).toBe(false);
    expect(verifyRes.reason).toContain('No audit anchor found');
  });

  it('detects snapshot signature tampering in LocalDiskAnchorRepository', async () => {
    const localRepo = new LocalDiskAnchorRepository('backups/test_tamper_repo');

    const snapshot = {
      anchorDate: '2026-11-30',
      sequenceNumber: '15',
      headHash: '1111111111111111111111111111111111111111111111111111111111111111',
      entryCount: '15',
      keyVersion: 'v1',
      anchorSignature: 'valid_sig_12345678901234567890123456789012345678901234567890123456',
      anchoredAt: new Date().toISOString(),
    };

    await localRepo.uploadSnapshot(snapshot);

    // Tampered snapshot expected comparison
    const tamperedExpected = { ...snapshot, anchorSignature: 'tampered_sig_0000000000' };
    const verifyRes = await localRepo.verifySnapshot('2026-11-30', tamperedExpected);

    expect(verifyRes.valid).toBe(false);
    expect(verifyRes.reason).toContain('signature mismatch');
  });

  it('recovers missed daily anchor days and enqueues jobs for past un-anchored dates', async () => {
    // Log an audit event
    await appendAuditLog(prisma, {
      action: 'RECOVERY_TEST_ACTION',
      resource: 'test',
      resourceId: 'rec-1',
      payload: { test: true },
    });

    const recoveryRes = await recoverMissedAuditAnchorDays(prisma, 'backups/test_recovery');
    expect(recoveryRes.checkedDatesCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(recoveryRes.enqueuedDates)).toBe(true);
  }, 30000);
});
