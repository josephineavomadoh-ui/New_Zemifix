import crypto from 'crypto';
import { platformPrisma } from './platformPrisma';

const AUDIT_HMAC_SECRET = process.env.PLATFORM_SESSION_SECRET || 'dev-audit-hmac-secret-at-least-32-chars-long';

export interface LogPlatformAuditParams {
  platformUserId?: string | null;
  tenantId?: string | null;
  action: string;
  targetResource: string;
  targetResourceId?: string | null;
  outcome?: 'SUCCESS' | 'FAILURE';
  clientIp?: string;
  payload?: any;
}

export async function logPlatformAudit(params: LogPlatformAuditParams): Promise<void> {
  let success = false;
  let attempts = 0;
  const maxAttempts = 3;

  while (!success && attempts < maxAttempts) {
    attempts++;
    try {
      await platformPrisma.$transaction(async (tx) => {
        const latest = await tx.platformAuditLog.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { checksum: true },
        });

        const previousChecksum = latest?.checksum ?? null;
        const sanitizedPayload = params.payload ? redactSensitiveData(params.payload) : null;

        const canonicalString = JSON.stringify({
          previousChecksum,
          platformUserId: params.platformUserId ?? null,
          tenantId: params.tenantId ?? null,
          action: params.action,
          targetResource: params.targetResource,
          targetResourceId: params.targetResourceId ?? null,
          outcome: params.outcome ?? 'SUCCESS',
          payload: sanitizedPayload,
        });

        const checksum = crypto
          .createHmac('sha256', AUDIT_HMAC_SECRET)
          .update(canonicalString)
          .digest('hex');

        await tx.platformAuditLog.create({
          data: {
            platformUserId: params.platformUserId ?? null,
            tenantId: params.tenantId ?? null,
            action: params.action,
            targetResource: params.targetResource,
            targetResourceId: params.targetResourceId ?? null,
            outcome: params.outcome ?? 'SUCCESS',
            clientIp: params.clientIp ?? '127.0.0.1',
            payload: sanitizedPayload,
            previousChecksum,
            checksum,
          },
        });
      }, { isolationLevel: 'Serializable' });

      success = true;
    } catch (err) {
      if (attempts >= maxAttempts) {
        console.error('[Platform Audit Log Concurrency Error after max attempts]:', err);
      } else {
        // Brief exponential backoff before retry on concurrency conflict
        await new Promise((res) => setTimeout(res, 50 * Math.pow(2, attempts)));
      }
    }
  }
}

function redactSensitiveData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const clone = Array.isArray(data) ? [...data] : { ...data };
  const sensitiveKeys = ['password', 'passwordHash', 'token', 'secret', 'mfaSecret', 'dbUrlEncrypted', 'authorization', 'cookie'];

  for (const key of Object.keys(clone)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
      clone[key] = '[REDACTED]';
    } else if (typeof clone[key] === 'object') {
      clone[key] = redactSensitiveData(clone[key]);
    }
  }
  return clone;
}
