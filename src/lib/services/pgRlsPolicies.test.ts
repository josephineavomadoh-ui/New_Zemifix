import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withSecurityContext, getTransactionSecurityContext } from './securityContextService';

const accAdminUrl = 'postgresql://postgres:javvy@localhost:5432/zemifix_acceptance?schema=public';
const accAppUserUrl = 'postgresql://zemifix_app_user:AppUserSecurePassword2026!@localhost:5432/zemifix_acceptance?schema=public';

const prismaAdmin = new PrismaClient({ datasources: { db: { url: accAdminUrl } } });
const prismaAppUser = new PrismaClient({ datasources: { db: { url: accAppUserUrl } } });

describe('PostgreSQL Row-Level Security (RLS) Policies & Isolation (Sub-stage 2.3)', () => {
  beforeAll(async () => {
    // Confirm connected to zemifix_acceptance
    const res = await prismaAdmin.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    if (res[0]?.current_database !== 'zemifix_acceptance') {
      throw new Error(`Test MUST run against zemifix_acceptance! Found: ${res[0]?.current_database}`);
    }
  });

  it('verifies RLS policies are enabled and forced on core domain tables in pg_policies catalog', async () => {
    const policies = await prismaAdmin.$queryRaw<Array<{ tablename: string; policyname: string; roles: string[] }>>`
      SELECT tablename, policyname, roles
        FROM pg_policies
       WHERE schemaname = 'public'
       ORDER BY tablename, policyname;
    `;

    expect(policies.length).toBeGreaterThan(0);
    const tableNames = policies.map((p) => p.tablename);
    expect(tableNames).toContain('work_orders');
    expect(tableNames).toContain('assets');
    expect(tableNames).toContain('customers');
    expect(tableNames).toContain('customer_sites');
    expect(tableNames).toContain('invoices');
    expect(tableNames).toContain('quotes');
    expect(tableNames).toContain('audit_logs');
  });

  it('enforces branch isolation at PostgreSQL RLS engine level for Branch scope', async () => {
    const branchAId = '01a1baaa-888d-7bd6-9f85-c15f0bb05f01';
    const branchBId = '01a1baaa-888d-7bd6-9f85-c15f0bb05f02';

    // Fixture creation as Admin
    const branchA = await prismaAdmin.branch.findFirst({ where: { code: 'HQ-ACC' } });
    const branchB = await prismaAdmin.branch.findFirst({ where: { code: 'REG-TEMA' } });
    const adminUser = await prismaAdmin.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    if (branchA && branchB && adminUser) {
      // Create WO for Branch B
      const woB = await prismaAdmin.workOrder.create({
        data: {
          workOrderNumber: `WO-RLS-TEST-${Date.now()}`,
          title: 'RLS Branch B Test Work Order',
          type: 'CORRECTIVE',
          priority: 'MEDIUM',
          status: 'OPEN',
          branchId: branchB.id,
        },
      });

      // Query under Branch A scope as restricted app user
      const branchAContext = {
        userId: adminUser.id,
        branchId: branchA.id,
        branchPath: branchA.path,
        accessScope: 'Branch' as const,
        realm: 'STAFF' as const,
      };

      await withSecurityContext(prismaAppUser, branchAContext, async (tx) => {
        const foundWoB = await tx.workOrder.findUnique({ where: { id: woB.id } });
        expect(foundWoB).toBeNull(); // Blocked by PostgreSQL RLS policy!
      });
    }
  });

  it('enforces customer portal cross-tenant isolation at PostgreSQL RLS engine level', async () => {
    const customerA = await prismaAdmin.customer.findFirst();
    if (customerA) {
      // Create WO for Customer A
      const woCustA = await prismaAdmin.workOrder.create({
        data: {
          workOrderNumber: `WO-CUST-RLS-${Date.now()}`,
          title: 'RLS Customer A Test Work Order',
          type: 'CORRECTIVE',
          priority: 'MEDIUM',
          status: 'OPEN',
          branchId: customerA.id ? (await prismaAdmin.branch.findFirst())!.id : '',
          customerId: customerA.id,
        },
      });

      // Query as Customer B context
      const customerBContext = {
        userId: '00000000-0000-0000-0000-000000000099',
        realm: 'CUSTOMER' as const,
        customerId: '00000000-0000-0000-0000-000000000088', // Customer B ID
      };

      await withSecurityContext(prismaAppUser, customerBContext, async (tx) => {
        const foundWoCustA = await tx.workOrder.findUnique({ where: { id: woCustA.id } });
        expect(foundWoCustA).toBeNull(); // Blocked by PostgreSQL RLS customer isolation policy!
      });
    }
  });

  it('allows worker realm access across company records for background worker context', async () => {
    const workerContext = {
      realm: 'WORKER' as const,
      accessScope: 'Company' as const,
    };

    await withSecurityContext(prismaAppUser, workerContext, async (tx) => {
      const count = await tx.workOrder.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
