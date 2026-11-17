import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withSecurityContext, getTransactionSecurityContext } from './securityContextService';

const accAdminUrl = 'postgresql://postgres:javvy@localhost:5432/zemifix_acceptance?schema=public';
const accAppUserUrl = 'postgresql://zemifix_app_user:AppUserSecurePassword2026!@localhost:5432/zemifix_acceptance?schema=public';

const prismaAdmin = new PrismaClient({ datasources: { db: { url: accAdminUrl } } });
const prismaAppUser = new PrismaClient({ datasources: { db: { url: accAppUserUrl } } });

describe('PostgreSQL RLS Fail-Closed Hardening & WITH CHECK Write Protection (Sub-stage 2.4)', () => {
  beforeAll(async () => {
    // Confirm connected to zemifix_acceptance
    const res = await prismaAdmin.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    if (res[0]?.current_database !== 'zemifix_acceptance') {
      throw new Error(`Test MUST run against zemifix_acceptance! Found: ${res[0]?.current_database}`);
    }
  });

  it('fails closed when access scope GUC is missing (app_access_scope defaults to Own)', async () => {
    const [scopeRes] = await prismaAppUser.$queryRaw<Array<{ scope: string }>>`
      SELECT app_access_scope() as scope;
    `;
    expect(scopeRes.scope).toBe('Own');
  });

  it('rejects unauthorized INSERT into Branch B by Branch A user via WITH CHECK clause', async () => {
    const branchA = await prismaAdmin.branch.findFirst({ where: { code: 'HQ-ACC' } });
    const branchB = await prismaAdmin.branch.findFirst({ where: { code: 'REG-TEMA' } });
    const adminUser = await prismaAdmin.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    if (branchA && branchB && adminUser) {
      const branchAContext = {
        userId: adminUser.id,
        branchId: branchA.id,
        branchPath: branchA.path,
        accessScope: 'Branch' as const,
        realm: 'STAFF' as const,
      };

      // Attempting to insert a work order for Branch B under Branch A context must throw an RLS policy violation!
      await expect(
        withSecurityContext(prismaAppUser, branchAContext, async (tx) => {
          return tx.workOrder.create({
            data: {
              workOrderNumber: `WO-WRITE-FAIL-${Date.now()}`,
              title: 'Unauthorized Branch B Insert Attempt',
              description: 'Testing RLS WITH CHECK protection',
              type: 'CORRECTIVE',
              priority: 'HIGH',
              status: 'OPEN',
              branchId: branchB.id, // Branch B ID under Branch A context
            },
          });
        })
      ).rejects.toThrowError(/row-level security policy/i);
    }
  });

  it('rejects unauthorized UPDATE relocating a Branch A record into Branch B', async () => {
    const branchA = await prismaAdmin.branch.findFirst({ where: { code: 'HQ-ACC' } });
    const branchB = await prismaAdmin.branch.findFirst({ where: { code: 'REG-TEMA' } });
    const adminUser = await prismaAdmin.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    if (branchA && branchB && adminUser) {
      // Create WO in Branch A
      const woA = await prismaAdmin.workOrder.create({
        data: {
          workOrderNumber: `WO-RELOCATE-${Date.now()}`,
          title: 'Branch A Work Order',
          description: 'Testing relocation rejection',
          type: 'CORRECTIVE',
          priority: 'MEDIUM',
          status: 'OPEN',
          branchId: branchA.id,
        },
      });

      const branchAContext = {
        userId: adminUser.id,
        branchId: branchA.id,
        branchPath: branchA.path,
        accessScope: 'Branch' as const,
        realm: 'STAFF' as const,
      };

      // Attempting to update branchId from Branch A to Branch B must throw an RLS WITH CHECK violation
      await expect(
        withSecurityContext(prismaAppUser, branchAContext, async (tx) => {
          return tx.workOrder.update({
            where: { id: woA.id },
            data: { branchId: branchB.id },
          });
        })
      ).rejects.toThrowError(/row-level security policy/i);
    }
  });

  it('verifies runtime application queries execute under zemifix_app_user when APP_DATABASE_URL is set', async () => {
    const [currentUserRes] = await prismaAppUser.$queryRaw<Array<{ current_user: string }>>`
      SELECT current_user;
    `;
    expect(currentUserRes.current_user).toBe('zemifix_app_user');
  });
});
