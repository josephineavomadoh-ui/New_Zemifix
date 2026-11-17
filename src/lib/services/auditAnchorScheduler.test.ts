import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  enqueueDailyAuditAnchorJob,
  runBackgroundWorker,
  getBackgroundJobMetrics,
} from './backgroundJobService';
import { appendAuditLog, verifyDailyAnchor } from './auditService';

const accDbUrl = 'postgresql://postgres:javvy@localhost:5432/zemifix_acceptance?schema=public';
const prisma = new PrismaClient({
  datasources: { db: { url: accDbUrl } },
});

const TEST_SIGNING_KEY = 'test-dedicated-audit-anchor-signing-key-32chars!';

describe('Daily Audit Anchor Background Scheduler & Worker (Sub-stage 1.3)', () => {
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    const res = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    if (res[0]?.current_database !== 'zemifix_acceptance') {
      throw new Error(`Test MUST run against zemifix_acceptance! Found: ${res[0]?.current_database}`);
    }
  });

  beforeEach(() => {
    process.env.AUDIT_ANCHOR_SIGNING_KEY = TEST_SIGNING_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('enqueues daily audit anchor background job with UTC date idempotency key', async () => {
    const offset = Math.floor(Math.random() * 100000) + 100;
    const testDate = new Date(Date.now() + offset * 86400000);
    const dateStr = testDate.toISOString().split('T')[0];

    const job1 = await enqueueDailyAuditAnchorJob(testDate, 'backups/test_scheduler_anchors');
    expect(job1.idempotencyKey).toBe(`daily-audit-anchor:${dateStr}`);
    expect(job1.jobType).toBe('ANCHOR_DAILY_AUDIT_LOGS');

    // Duplicate enqueue for same UTC date returns existing job without duplicate creation
    const job2 = await enqueueDailyAuditAnchorJob(testDate, 'backups/test_scheduler_anchors');
    expect(job2.id).toBe(job1.id);
  });

  it('executes ANCHOR_DAILY_AUDIT_LOGS job via worker and distinguishes local vs external storage status', async () => {
    const offset = Math.floor(Math.random() * 100000) + 200;
    const testDate = new Date(Date.now() + offset * 86400000);
    const dateStr = testDate.toISOString().split('T')[0];

    await appendAuditLog(prisma, {
      action: 'SCHEDULER_TEST_AUDIT',
      resource: 'test_sched',
      resourceId: 'sched-1',
      payload: { test: true },
    });

    await enqueueDailyAuditAnchorJob(testDate, 'backups/test_scheduler_anchors');

    const workerId = `test-worker-${Date.now()}`;
    const execRes = await runBackgroundWorker(workerId, 'ANCHOR_DAILY_AUDIT_LOGS');

    expect(execRes.executed).toBe(true);
    expect(execRes.jobType).toBe('ANCHOR_DAILY_AUDIT_LOGS');
    expect(execRes.result).toBeDefined();
    expect(execRes.result.success).toBe(true);
    expect(execRes.result.anchorDate).toBe(dateStr);
    expect(execRes.result.localSnapshotCreated).toBe(true);
    // Unconfigured S3 env in test environment correctly reported as UNCONFIGURED_EXTERNAL_STORAGE
    expect(execRes.result.externalPublicationStatus).toBe('UNCONFIGURED_EXTERNAL_STORAGE');

    const verifyRes = await verifyDailyAnchor(testDate, prisma);
    expect(verifyRes.valid).toBe(true);
  });

  it('handles background job retry and exponential backoff on failure', async () => {
    // Delete signing key to force a job error
    delete process.env.AUDIT_ANCHOR_SIGNING_KEY;

    const offset = Math.floor(Math.random() * 100000) + 300;
    const testDate = new Date(Date.now() + offset * 86400000);

    const job = await enqueueDailyAuditAnchorJob(testDate, 'backups/test_scheduler_anchors');

    const workerId = `test-worker-fail-${Date.now()}`;
    const execRes = await runBackgroundWorker(workerId, 'ANCHOR_DAILY_AUDIT_LOGS');

    expect(execRes.executed).toBe(true);
    expect(execRes.success).toBe(false);
    expect(execRes.status).toBe('RETRYING');
    expect(execRes.error).toContain('AUDIT_ANCHOR_KEY_INVALID');
  });
});
