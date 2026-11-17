import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { appendAuditLog, anchorDailyHeadHash, verifyDailyAnchor, verifyAuditChain } from './auditService';

const accDbUrl = 'postgresql://postgres:javvy@localhost:5432/zemifix_acceptance?schema=public';
const prisma = new PrismaClient({
  datasources: { db: { url: accDbUrl } },
});

describe('Audit Chain Daily Anchoring & Verification (Sub-stage 1)', () => {
  beforeAll(async () => {
    // Confirm connected to zemifix_acceptance
    const res = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    if (res[0]?.current_database !== 'zemifix_acceptance') {
      throw new Error(`Test MUST run against zemifix_acceptance! Found: ${res[0]?.current_database}`);
    }
  });

  it('creates an audit log entry and computes a daily external head hash anchor', async () => {
    const auditRes = await appendAuditLog(prisma, {
      action: 'TEST_ANCHOR_ACTION',
      resource: 'test_resource',
      resourceId: 'test-id-100',
      payload: { test: true },
    });

    expect(auditRes.sequenceNumber).toBeGreaterThan(0n);
    expect(auditRes.hash).toHaveLength(64);

    const today = new Date();
    const anchorRes = await anchorDailyHeadHash(prisma, today, 'backups/test_audit_anchors');

    expect(anchorRes.sequenceNumber).toBeGreaterThanOrEqual(auditRes.sequenceNumber);
    expect(anchorRes.anchorSignature).toHaveLength(64);

    const verifyRes = await verifyDailyAnchor(today, prisma);
    expect(verifyRes.valid).toBe(true);
    expect(verifyRes.reason).toBeUndefined();
  });

  it('verifies audit chain integrity alongside daily head hash anchor', async () => {
    const chainRes = await verifyAuditChain();
    expect(chainRes.valid).toBe(true);
  });
});
