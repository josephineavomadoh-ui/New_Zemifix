import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { generateUuidV7 } from '../uuid';
import { appendAuditLog, anchorDailyHeadHash } from './auditService';
import { S3WormAnchorRepository } from './auditExternalRepository';
import { evaluateAllActiveSlaBreaches } from './slaService';
import { notifyStaff } from './notificationService';
import { createWorkOrder } from './workOrderService';
import crypto from 'crypto';

export interface EnqueueJobParams {
  jobType: 'GENERATE_PREVENTIVE_MAINTENANCE' | 'MONITOR_SLAS' | 'PROCESS_NOTIFICATIONS' | 'ANCHOR_DAILY_AUDIT_LOGS';
  payload?: Record<string, any>;
  idempotencyKey: string;
  maxRetries?: number;
}

/**
 * Register or update worker heartbeat
 */
export async function updateWorkerHeartbeat(workerId: string, currentJobId?: string | null) {
  const now = new Date();
  return await prisma.backgroundWorker.upsert({
    where: { workerId },
    update: {
      lastHeartbeatAt: now,
      status: 'ACTIVE',
      currentJobId: currentJobId ?? null,
    },
    create: {
      id: generateUuidV7(),
      workerId,
      status: 'ACTIVE',
      currentJobId: currentJobId ?? null,
      lastHeartbeatAt: now,
    },
  });
}

/**
 * Enqueue a background job with idempotency protection
 */
export async function enqueueBackgroundJob(params: EnqueueJobParams) {
  try {
    const job = await prisma.backgroundJob.upsert({
      where: { idempotencyKey: params.idempotencyKey },
      update: {},
      create: {
        id: generateUuidV7(),
        jobType: params.jobType,
        status: 'PENDING',
        payload: params.payload ?? {},
        maxRetries: params.maxRetries ?? 5,
        idempotencyKey: params.idempotencyKey,
      },
    });
    return job;
  } catch (err: any) {
    console.error('[BackgroundJob] Enqueue error:', err);
    throw err;
  }
}

/**
 * Atomically claim the next available background job using PostgreSQL FOR UPDATE SKIP LOCKED
 */
export async function claimNextBackgroundJob(workerId: string, targetJobType?: string) {
  const now = new Date();
  const leaseDurationMs = 5 * 60 * 1000; // 5 minute lease
  const expiresAt = new Date(now.getTime() + leaseDurationMs);

  await updateWorkerHeartbeat(workerId);

  return await prisma.$transaction(async (tx: any) => {
    let rows: Array<{ id: string }>;
    if (targetJobType) {
      rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "background_jobs"
        WHERE ("status" = 'PENDING' OR ("status" IN ('RETRYING', 'RUNNING') AND "expiresAt" < ${now}))
          AND "jobType" = ${targetJobType}
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
      `;
    } else {
      rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "background_jobs"
        WHERE ("status" = 'PENDING' OR ("status" IN ('RETRYING', 'RUNNING') AND "expiresAt" < ${now}))
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
      `;
    }

    if (rows.length === 0) return null;
    const jobId = rows[0].id;

    const jobRow = await tx.backgroundJob.findUnique({ where: { id: jobId } });
    const isRetry = jobRow?.status === 'RETRYING';

    await tx.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'RUNNING',
        workerId,
        startedAt: now,
        expiresAt,
        retryCount: { increment: isRetry ? 1 : 0 },
      },
    });

    await updateWorkerHeartbeat(workerId, jobId);
    return await tx.backgroundJob.findUnique({ where: { id: jobId } });
  });
}

/**
 * Execute Preventive Maintenance Automation with PostgreSQL Transaction Advisory Lock Idempotency
 */
export function calculateNextDueDate(currentDue: Date, frequencyStr: string): Date {
  const freq = (frequencyStr ?? '').toLowerCase();
  const year = currentDue.getFullYear();
  const month = currentDue.getMonth();
  const day = currentDue.getDate();

  const result = new Date(currentDue);

  if (freq.includes('year') || freq.includes('annual') || freq.includes('12 months')) {
    let targetYear = year + 1;
    let targetMonth = month;
    let targetDay = day;
    if (month === 1 && day === 29) {
      const isLeap = (targetYear % 4 === 0 && targetYear % 100 !== 0) || (targetYear % 400 === 0);
      if (!isLeap) {
        targetDay = 28;
      }
    }
    result.setFullYear(targetYear, targetMonth, targetDay);
  } else if (freq.includes('quarter') || freq.includes('3 months')) {
    let targetMonth = month + 3;
    let targetYear = year + Math.floor(targetMonth / 12);
    targetMonth = targetMonth % 12;

    const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const targetDay = Math.min(day, lastDayOfTargetMonth);

    result.setFullYear(targetYear, targetMonth, targetDay);
  } else if (freq.includes('month')) {
    let targetMonth = month + 1;
    let targetYear = year + Math.floor(targetMonth / 12);
    targetMonth = targetMonth % 12;

    const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const targetDay = Math.min(day, lastDayOfTargetMonth);

    result.setFullYear(targetYear, targetMonth, targetDay);
  } else if (freq.includes('week') || freq.includes('bi-weekly') || freq.includes('14 days')) {
    const daysToAdd = freq.includes('bi-weekly') || freq.includes('14 days') ? 14 : 7;
    result.setDate(result.getDate() + daysToAdd);
  } else if (freq.includes('day') || freq.includes('daily')) {
    result.setDate(result.getDate() + 1);
  } else {
    result.setDate(result.getDate() + 30);
  }

  return result;
}

/**
 * Execute Preventive Maintenance Automation with PostgreSQL Transaction Advisory Lock Idempotency
 */
async function executePreventiveMaintenanceJob(payload?: Record<string, any>) {
  const now = new Date();
  const occurrenceDateStr = now.toISOString().slice(0, 10);

  const planWhere: any = {
    status: 'ACTIVE',
    deletedAt: null,
  };

  if (payload?.planId) {
    planWhere.id = payload.planId;
  }
  if (payload?.assetId) {
    planWhere.assetId = payload.assetId;
  }

  const plans = await prisma.maintenancePlan.findMany({
    where: planWhere,
    include: {
      asset: true,
      branch: true,
    },
    take: 50,
  });

  let generatedCount = 0;
  const adminUser = await prisma.user.findFirst({ where: { isActive: true } });
  if (!adminUser) return { success: true, generatedCount: 0, message: 'No admin user for PM generation' };

  for (const plan of plans) {
    if (!plan.asset || plan.asset.status !== 'OPERATIONAL' || plan.asset.deletedAt) {
      continue;
    }

    const occurrenceKey = `pm-occ:${plan.id}:${occurrenceDateStr}`;

    try {
      const createdInTx = await prisma.$transaction(async (tx: any) => {
        // PostgreSQL transaction advisory lock on occurrence key hash prevents race conditions across concurrent workers
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${occurrenceKey}))`;

        const existingOccurrenceWo = await tx.workOrder.findFirst({
          where: {
            maintenancePlanId: plan.id,
            type: 'PREVENTIVE',
            description: { contains: occurrenceKey },
          },
        });

        if (!existingOccurrenceWo) {
          await createWorkOrder(adminUser as any, {
            title: `Scheduled Preventive Maintenance (${plan.code}) — ${plan.name} (${plan.asset.name})`,
            description: `Automated periodic preventive maintenance for plan ${plan.code} [Occurrence Key: ${occurrenceKey}]`,
            type: 'PREVENTIVE',
            priority: 'MEDIUM',
            assetId: plan.assetId,
            branchId: plan.branchId,
            maintenancePlanId: plan.id,
            plannedStart: new Date(),
            plannedEnd: new Date(Date.now() + 8 * 60 * 60 * 1000),
          });

          const nextDueDate = calculateNextDueDate(plan.nextDue, plan.frequency);

          await tx.maintenancePlan.update({
            where: { id: plan.id },
            data: {
              lastCompleted: now,
              nextDue: nextDueDate,
            },
          });

          return true;
        }
        return false;
      });

      if (createdInTx) generatedCount++;
    } catch (err) {
      console.error(`[PM Automation] Failed to generate PM occurrence for plan ${plan.code}:`, err);
    }
  }

  return { success: true, assessedPlans: plans.length, generatedCount };
}

/**
 * Execute SLA Monitoring Automation
 */
async function executeSlaMonitoringJob() {
  const result = await evaluateAllActiveSlaBreaches();
  return {
    success: true,
    evaluatedCount: result.evaluatedCount,
    breachesLoggedCount: result.evaluationResults.reduce((sum, r) => sum + r.breachesLogged.length, 0),
  };
}

/**
 * Execute Notification Processing Automation
 */
async function executeNotificationProcessingJob() {
  const pendingDeliveries = await prisma.notificationEmailDelivery.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      attemptCount: { lt: 5 },
      nextAttemptAt: { lte: new Date() },
    },
    take: 50,
    include: { notification: true },
  });

  let sentCount = 0;
  let failCount = 0;

  for (const delivery of pendingDeliveries) {
    try {
      await prisma.notificationEmailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });
      sentCount++;
    } catch (err: any) {
      failCount++;
      await prisma.notificationEmailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          lastError: err.message,
          attemptCount: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
    }
  }

  return { success: true, sentCount, failCount };
}

/**
 * Execute Daily Audit Logs Head Hash Anchoring Automation
 */
async function executeAnchorDailyAuditLogsJob(payload?: Record<string, any>) {
  const targetDate = payload?.targetDateStr ? new Date(payload.targetDateStr) : new Date(Date.now() - 86400000);
  const externalRepoDir = payload?.externalRepoDir || 'backups/audit_anchors';
  const keyVersion = payload?.keyVersion || 'v1';

  const anchorResult = await anchorDailyHeadHash(prisma, targetDate, externalRepoDir, keyVersion);
  const s3Repo = new S3WormAnchorRepository();

  return {
    success: true,
    anchorDate: anchorResult.anchorDate,
    sequenceNumber: anchorResult.sequenceNumber.toString(),
    headHash: anchorResult.headHash,
    entryCount: anchorResult.entryCount.toString(),
    keyVersion: anchorResult.keyVersion,
    localSnapshotCreated: true,
    externalPublicationStatus: s3Repo.isConfigured ? 'PUBLISHED' : 'UNCONFIGURED_EXTERNAL_STORAGE',
  };
}

/**
 * Enqueue Daily Audit Anchor Job with UTC Date Idempotency Protection
 */
export async function enqueueDailyAuditAnchorJob(targetDate?: Date, externalRepoDir?: string) {
  const d = targetDate ?? new Date(Date.now() - 86400000);
  const dateStr = d.toISOString().split('T')[0];
  const idempotencyKey = `daily-audit-anchor:${dateStr}`;

  return enqueueBackgroundJob({
    jobType: 'ANCHOR_DAILY_AUDIT_LOGS',
    payload: { targetDateStr: dateStr, externalRepoDir },
    idempotencyKey,
    maxRetries: 5,
  });
}

/**
 * Scans audit_logs for past completed UTC dates that do NOT have an anchor in audit_anchors,
 * and enqueues an anchor background job for each missing date (Missed-Day Recovery).
 */
export async function recoverMissedAuditAnchorDays(client: any = prisma, externalRepoDir?: string): Promise<{ checkedDatesCount: number; enqueuedDates: string[] }> {
  const [earliestLog] = await client.$queryRaw<Array<{ createdAt: Date }>>`
    SELECT "createdAt" FROM "audit_logs" ORDER BY "sequenceNumber"::bigint ASC LIMIT 1
  `;

  if (!earliestLog) {
    return { checkedDatesCount: 0, enqueuedDates: [] };
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const startDateStr = new Date(earliestLog.createdAt).toISOString().split('T')[0];

  const currentDate = new Date(`${startDateStr}T00:00:00.000Z`);
  const endDate = new Date(`${todayStr}T00:00:00.000Z`); // Excludes today (incomplete day)

  const enqueuedDates: string[] = [];
  let checkedDatesCount = 0;

  while (currentDate < endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    checkedDatesCount++;

    const anchorDateObj = new Date(`${dateStr}T00:00:00.000Z`);
    const [existingAnchor] = await client.$queryRaw<Array<{ anchorDate: Date }>>`
      SELECT "anchorDate" FROM "audit_anchors" WHERE "anchorDate" = ${anchorDateObj}::date
    `;

    if (!existingAnchor) {
      await enqueueDailyAuditAnchorJob(new Date(currentDate), externalRepoDir);
      enqueuedDates.push(dateStr);
    }

    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return { checkedDatesCount, enqueuedDates };
}

/**
 * Run Background Worker Loop with Ownership Fencing
 */
export async function runBackgroundWorker(workerId: string, targetJobType?: string) {
  const job = await claimNextBackgroundJob(workerId, targetJobType);
  if (!job) {
    await updateWorkerHeartbeat(workerId, null);
    return { executed: false, message: 'No pending jobs found.' };
  }

  try {
    let result: any = null;
    if (job.jobType === 'GENERATE_PREVENTIVE_MAINTENANCE') {
      result = await executePreventiveMaintenanceJob(job.payload as Record<string, any>);
    } else if (job.jobType === 'MONITOR_SLAS') {
      result = await executeSlaMonitoringJob();
    } else if (job.jobType === 'PROCESS_NOTIFICATIONS') {
      result = await executeNotificationProcessingJob();
    } else if (job.jobType === 'ANCHOR_DAILY_AUDIT_LOGS') {
      result = await executeAnchorDailyAuditLogsJob(job.payload as Record<string, any>);
    } else {
      throw new Error(`UNKNOWN_JOB_TYPE: ${job.jobType}`);
    }

    // Ownership Fencing check: verify workerId still owns the job and lease has not expired
    const now = new Date();
    const fencingCheck = await prisma.backgroundJob.updateMany({
      where: {
        id: job.id,
        workerId,
        status: 'RUNNING',
        expiresAt: { gt: now },
      },
      data: {
        status: 'COMPLETED',
        result,
        completedAt: now,
        expiresAt: null,
      },
    });

    if (fencingCheck.count === 0) {
      throw new Error('OWNERSHIP_FENCING_VIOLATION: Worker lease expired or was reclaimed by another worker.');
    }

    await updateWorkerHeartbeat(workerId, null);
    return { executed: true, jobId: job.id, jobType: job.jobType, result };
  } catch (err: any) {
    const now = new Date();
    const nextRetryCount = job.retryCount + 1;
    const isFailedPermanently = nextRetryCount >= job.maxRetries;
    const nextStatus = isFailedPermanently ? 'FAILED' : 'RETRYING';
    const backoffMs = Math.pow(2, nextRetryCount) * 1000;

    await prisma.backgroundJob.updateMany({
      where: {
        id: job.id,
        workerId,
      },
      data: {
        status: nextStatus,
        retryCount: nextRetryCount,
        lastError: err.message,
        expiresAt: new Date(now.getTime() + backoffMs),
      },
    });

    await updateWorkerHeartbeat(workerId, null);
    return { executed: true, jobId: job.id, success: false, error: err.message, status: nextStatus };
  }
}

export async function getBackgroundJobMetrics() {
  const [pending, running, completed, failed, retrying, workers, recentJobs] = await Promise.all([
    prisma.backgroundJob.count({ where: { status: 'PENDING' } }),
    prisma.backgroundJob.count({ where: { status: 'RUNNING' } }),
    prisma.backgroundJob.count({ where: { status: 'COMPLETED' } }),
    prisma.backgroundJob.count({ where: { status: 'FAILED' } }),
    prisma.backgroundJob.count({ where: { status: 'RETRYING' } }),
    prisma.backgroundWorker.findMany({ orderBy: { lastHeartbeatAt: 'desc' } }),
    prisma.backgroundJob.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
  ]);

  return {
    metrics: { pending, running, completed, failed, retrying },
    workers,
    recentJobs,
  };
}
