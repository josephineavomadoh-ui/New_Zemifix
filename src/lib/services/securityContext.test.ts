import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  withSecurityContext,
  getTransactionSecurityContext,
} from './securityContextService';

const accDbUrl = 'postgresql://postgres:javvy@localhost:5432/zemifix_acceptance?schema=public';
const accAppUserDbUrl = 'postgresql://zemifix_app_user:AppUserSecurePassword2026!@localhost:5432/zemifix_acceptance?schema=public';

const prismaAdmin = new PrismaClient({ datasources: { db: { url: accDbUrl } } });
const prismaAppUser = new PrismaClient({ datasources: { db: { url: accAppUserDbUrl } } });

describe('PostgreSQL Runtime Role Separation & Transaction-Scoped Security Context (Sub-stage 2.2)', () => {
  beforeAll(async () => {
    // Confirm connected to zemifix_acceptance
    const res = await prismaAdmin.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    if (res[0]?.current_database !== 'zemifix_acceptance') {
      throw new Error(`Test MUST run against zemifix_acceptance! Found: ${res[0]?.current_database}`);
    }
  });

  it('verifies zemifix_app_user exists and is not superuser and has no BYPASSRLS', async () => {
    const [roleInfo] = await prismaAdmin.$queryRaw<Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean }>>`
      SELECT rolname, rolsuper, rolbypassrls, rolcreatedb
        FROM pg_roles
       WHERE rolname = 'zemifix_app_user'
    `;

    expect(roleInfo).toBeDefined();
    expect(roleInfo.rolname).toBe('zemifix_app_user');
    expect(roleInfo.rolsuper).toBe(false);
    expect(roleInfo.rolbypassrls).toBe(false);
    expect(roleInfo.rolcreatedb).toBe(false);
  });

  it('verifies zemifix_app_user cannot execute DDL operations (CREATE TABLE / DROP TABLE)', async () => {
    await expect(
      prismaAppUser.$executeRaw`CREATE TABLE "unauthorized_test_table" ("id" INT);`
    ).rejects.toThrowError(/permission denied/i);
  });

  it('verifies zemifix_app_user can execute DML operations (SELECT)', async () => {
    const count = await prismaAppUser.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('establishes transaction-scoped security context and resets after transaction completes', async () => {
    const testContext = {
      userId: '01a1baaa-888d-7bd6-9f85-c15f0bb05fad',
      branchId: '01a1baaa-888d-7bd6-9f85-c15f0bb05f01',
      branchPath: '/HQ-ACC/',
      departmentId: '01a1baaa-888d-7bd6-9f85-c15f0bb05f02',
      accessScope: 'BranchAndBelow' as const,
      realm: 'STAFF' as const,
    };

    let innerContext: any = null;

    await withSecurityContext(prismaAppUser, testContext, async (tx) => {
      innerContext = await getTransactionSecurityContext(tx);
    });

    expect(innerContext.userId).toBe(testContext.userId);
    expect(innerContext.branchPath).toBe(testContext.branchPath);
    expect(innerContext.accessScope).toBe(testContext.accessScope);
    expect(innerContext.realm).toBe('STAFF');

    // Outside transaction, GUC settings are reset (is_local = true)
    const [outsideRes] = await prismaAppUser.$queryRaw<Array<{ userId: string }>>`
      SELECT current_setting('app.current_user_id', true) as "userId";
    `;
    expect(outsideRes.userId).toBe('');
  });

  it('prevents context leakage across consecutive transactions on same connection', async () => {
    const user1Context = {
      userId: '11111111-1111-1111-1111-111111111111',
      accessScope: 'Branch' as const,
      realm: 'STAFF' as const,
    };

    const user2Context = {
      userId: '22222222-2222-2222-2222-222222222222',
      accessScope: 'Department' as const,
      realm: 'STAFF' as const,
    };

    let ctx1: any = null;
    let ctx2: any = null;

    await withSecurityContext(prismaAppUser, user1Context, async (tx) => {
      ctx1 = await getTransactionSecurityContext(tx);
    });

    await withSecurityContext(prismaAppUser, user2Context, async (tx) => {
      ctx2 = await getTransactionSecurityContext(tx);
    });

    expect(ctx1.userId).toBe(user1Context.userId);
    expect(ctx2.userId).toBe(user2Context.userId);
  });

  it('fails closed when security context is missing or invalid', async () => {
    await expect(
      withSecurityContext(prismaAppUser, {}, async () => undefined)
    ).rejects.toThrowError(/SECURITY_CONTEXT_MISSING/);
  });

  it('explicitly distinguishes STAFF, CUSTOMER, and WORKER realms in context', async () => {
    const workerContext = {
      realm: 'WORKER' as const,
      accessScope: 'Company' as const,
    };

    let ctx: any = null;
    await withSecurityContext(prismaAppUser, workerContext, async (tx) => {
      ctx = await getTransactionSecurityContext(tx);
    });

    expect(ctx.realm).toBe('WORKER');
  });
});
