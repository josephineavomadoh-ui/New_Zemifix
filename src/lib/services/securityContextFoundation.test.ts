import { Prisma, PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../prisma';
import {
  getTransactionSecurityContext,
  SecurityContextInput,
  withSecurityContext,
} from './securityContextService';

vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.TEST_DATABASE_URL =
    'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
});

const fullContext: SecurityContextInput = {
  userId: '11111111-1111-4111-8111-111111111111',
  branchId: '22222222-2222-4222-8222-222222222222',
  branchPath: '/HQ-ACC/',
  departmentId: '33333333-3333-4333-8333-333333333333',
  accessScope: 'BranchAndBelow',
  realm: 'STAFF',
  customerId: '44444444-4444-4444-8444-444444444444',
  taskId: '55555555-5555-4555-8555-555555555555',
  taskType: 'PM_GENERATION',
  companyId: '66666666-6666-4666-8666-666666666666',
};

const settingNames = [
  'app.current_user_id',
  'app.current_branch_id',
  'app.current_branch_path',
  'app.current_department_id',
  'app.current_access_scope',
  'app.current_realm',
  'app.current_customer_id',
  'app.current_task_id',
  'app.current_task_type',
  'app.current_company_id',
  'app.context_signature',
];

function createTransactionHarness() {
  const settings = new Map<string, string>();
  const rawCalls: Array<{ sql: string; values: unknown[] }> = [];
  let transactionCount = 0;
  let setupError: Error | undefined;

  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      rawCalls.push({ sql, values });

      if (sql.includes('pg_backend_pid()')) {
        return [{
          backendPid: '1234',
          transactionId: '5678',
          sessionUser: 'zemifix_app_user',
          currentDatabase: 'zemifix_dev',
        }];
      }

      if (sql.includes('set_config(')) {
        if (setupError) throw setupError;
        const names = Array.from(sql.matchAll(/set_config\('([^']+)'/g), (match) => match[1]);
        names.forEach((name, index) => settings.set(name, String(values[index])));
        return [];
      }

      return [{
        userId: settings.get('app.current_user_id') ?? '',
        branchId: settings.get('app.current_branch_id') ?? '',
        branchPath: settings.get('app.current_branch_path') ?? '',
        departmentId: settings.get('app.current_department_id') ?? '',
        accessScope: settings.get('app.current_access_scope') ?? '',
        realm: settings.get('app.current_realm') ?? '',
        customerId: settings.get('app.current_customer_id') ?? '',
        taskId: settings.get('app.current_task_id') ?? '',
        taskType: settings.get('app.current_task_type') ?? '',
        companyId: settings.get('app.current_company_id') ?? '',
        signatureValid: true,
      }];
    }),
  } as unknown as Prisma.TransactionClient;

  const client = {
    $transaction: vi.fn(async (
      callback: (transaction: Prisma.TransactionClient) => Promise<unknown>
    ) => {
      transactionCount += 1;
      try {
        return await callback(tx);
      } finally {
        settings.clear();
      }
    }),
  } as unknown as PrismaClient;

  return {
    client,
    tx,
    rawCalls,
    settings,
    setSetupError(error: Error) {
      setupError = error;
    },
    get transactionCount() {
      return transactionCount;
    },
  };
}

describe('Stage 2 transaction security context foundation', () => {
  let harness: ReturnType<typeof createTransactionHarness>;

  beforeEach(() => {
    harness = createTransactionHarness();
    vi.stubEnv('APP_CONTEXT_HMAC_SECRET', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('validates and configures all ten context fields with parameterized transaction-local GUCs', async () => {
    const original = { ...fullContext };
    let observed: Awaited<ReturnType<typeof getTransactionSecurityContext>> | undefined;

    await withSecurityContext(harness.client, original, async (tx) => {
      observed = await getTransactionSecurityContext(tx);
    });

    expect(observed).toEqual({
      userId: fullContext.userId,
      branchId: fullContext.branchId,
      branchPath: fullContext.branchPath,
      departmentId: fullContext.departmentId,
      accessScope: fullContext.accessScope,
      realm: fullContext.realm,
      customerId: fullContext.customerId,
      taskId: fullContext.taskId,
      taskType: fullContext.taskType,
      companyId: fullContext.companyId,
    });

    const setConfigCall = harness.rawCalls.find((call) => call.sql.includes('set_config('));
    expect(setConfigCall).toBeDefined();
    if (!setConfigCall) throw new Error('Expected transaction-local GUC setup query.');
    expect(settingNames.every((name) => setConfigCall.sql.includes(name))).toBe(true);
    expect(setConfigCall.sql.match(/set_config\(/g)).toHaveLength(11);
    expect(setConfigCall.sql).toContain(', true)');
    expect(setConfigCall.values.slice(0, 10)).toEqual([
      fullContext.userId,
      fullContext.branchId,
      fullContext.branchPath,
      fullContext.departmentId,
      fullContext.accessScope,
      fullContext.realm,
      fullContext.customerId,
      fullContext.taskId,
      fullContext.taskType,
      fullContext.companyId,
    ]);
    expect(setConfigCall.values[10]).toMatch(/^[0-9a-f]{64}$/);
    expect(setConfigCall.sql).not.toContain(String(fullContext.userId));
  });

  it('rejects invalid UUIDs, access scopes, and realms before opening a transaction', async () => {
    const uuidFields = [
      'userId',
      'branchId',
      'departmentId',
      'customerId',
      'taskId',
      'companyId',
    ] as const;

    for (const field of uuidFields) {
      const invalidContext = { ...fullContext, [field]: 'not-a-uuid' };
      await expect(
        withSecurityContext(
          harness.client,
          invalidContext as SecurityContextInput,
          async () => undefined
        )
      ).rejects.toThrow(new RegExp(`SECURITY_CONTEXT_INVALID.*${field}`));
    }

    await expect(
      withSecurityContext(
        harness.client,
        { accessScope: 'Global' } as unknown as SecurityContextInput,
        async () => undefined
      )
    ).rejects.toThrow(/SECURITY_CONTEXT_INVALID.*accessScope/);
    await expect(
      withSecurityContext(
        harness.client,
        { realm: 'ADMIN' } as unknown as SecurityContextInput,
        async () => undefined
      )
    ).rejects.toThrow(/SECURITY_CONTEXT_INVALID.*realm/);
    await expect(
      withSecurityContext(
        harness.client,
        { ...fullContext, branchPath: 'x'.repeat(2049) },
        async () => undefined
      )
    ).rejects.toThrow(/SECURITY_CONTEXT_INVALID.*branchPath/);
    await expect(
      withSecurityContext(
        harness.client,
        { ...fullContext, taskType: 'x'.repeat(129) },
        async () => undefined
      )
    ).rejects.toThrow(/SECURITY_CONTEXT_INVALID.*taskType/);
    expect(harness.client.$transaction).not.toHaveBeenCalled();
  });

  it('freezes the exposed context and rejects mutation of caller input during a transaction', async () => {
    const mutableContext = { ...fullContext };

    await withSecurityContext(harness.client, mutableContext, async (tx) => {
      const established = await getTransactionSecurityContext(tx);
      expect(Object.isFrozen(established)).toBe(true);
      expect(() => {
        (established as { userId: string }).userId = '77777777-7777-4777-8777-777777777777';
      }).toThrow();

      mutableContext.userId = '77777777-7777-4777-8777-777777777777';
      await expect(
        withSecurityContext(mutableContext, async () => undefined, tx)
      ).rejects.toThrow(/SECURITY_CONTEXT_CONFLICT/);
    });
  });

  it('rejects a nested context replacement and reuses an established matching transaction', async () => {
    await withSecurityContext(harness.client, fullContext, async (tx) => {
      await withSecurityContext({ ...fullContext }, async (nestedTx) => {
        expect(nestedTx).toBe(tx);
      });

      await withSecurityContext({ ...fullContext }, async (nestedTx) => {
        expect(nestedTx).toBe(tx);
      }, tx);

      await expect(
        withSecurityContext(
          { ...fullContext, accessScope: 'Company' },
          async () => undefined,
          tx
        )
      ).rejects.toThrow(/SECURITY_CONTEXT_CONFLICT/);
    });

    expect(harness.transactionCount).toBe(1);
  });

  it('rejects a different active transaction even when its context matches', async () => {
    const otherHarness = createTransactionHarness();
    let otherTx: Prisma.TransactionClient | undefined;
    let resolveStarted: (() => void) | undefined;
    let releaseOther: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      releaseOther = resolve;
    });

    const otherTransaction = withSecurityContext(
      otherHarness.client,
      fullContext,
      async (tx) => {
        otherTx = tx;
        resolveStarted?.();
        await hold;
      }
    );
    await started;

    await withSecurityContext(harness.client, fullContext, async () => {
      await expect(
        withSecurityContext(fullContext, async () => undefined, otherTx)
      ).rejects.toThrow(/SECURITY_TRANSACTION_SWITCH/);
    });

    releaseOther?.();
    await otherTransaction;
  });

  it('rejects uninitialized transaction clients instead of silently setting their context', async () => {
    await expect(
      withSecurityContext(fullContext, async () => undefined, harness.tx)
    ).rejects.toThrow(/UNINITIALIZED_TRANSACTION_CONTEXT/);
  });

  it('does not run the protected callback if GUC setup fails', async () => {
    const setupFailure = new Error('GUC setup rejected');
    harness.setSetupError(setupFailure);
    const callback = vi.fn(async () => undefined);

    await expect(
      withSecurityContext(harness.client, fullContext, callback)
    ).rejects.toBe(setupFailure);

    expect(callback).not.toHaveBeenCalled();
    expect(harness.settings.size).toBe(0);
  });

  it('detects user, tenant, and access-scope GUC changes when context is revalidated', async () => {
    const tamperingCases = [
      ['app.current_user_id', '77777777-7777-4777-8777-777777777777'],
      ['app.current_company_id', '88888888-8888-4888-8888-888888888888'],
      ['app.current_access_scope', 'Company'],
    ] as const;

    await withSecurityContext(harness.client, fullContext, async (tx) => {
      for (const [guc, replacement] of tamperingCases) {
        const original = harness.settings.get(guc);
        harness.settings.set(guc, replacement);
        await expect(getTransactionSecurityContext(tx)).rejects.toThrow(
          /SECURITY_CONTEXT_CONFLICT/
        );
        if (original === undefined) {
          harness.settings.delete(guc);
        } else {
          harness.settings.set(guc, original);
        }
      }
    });
  });

  it('propagates rollback and clears context metadata before a reused connection starts another transaction', async () => {
    const firstError = new Error('forced rollback');
    await expect(
      withSecurityContext(harness.client, fullContext, async () => {
        throw firstError;
      })
    ).rejects.toBe(firstError);

    expect(harness.settings.size).toBe(0);

    const nextContext = {
      ...fullContext,
      userId: '77777777-7777-4777-8777-777777777777',
      taskType: 'SLA_EVALUATION',
    };
    await withSecurityContext(harness.client, nextContext, async (tx) => {
      const observed = await getTransactionSecurityContext(tx);
      expect(observed.userId).toBe(nextContext.userId);
      expect(observed.taskType).toBe(nextContext.taskType);
    });

    expect(harness.transactionCount).toBe(2);
    expect(harness.settings.size).toBe(0);
    await expect(getTransactionSecurityContext(harness.tx)).rejects.toThrow(
      /UNINITIALIZED_TRANSACTION_CONTEXT/
    );
  });

  it('blocks root Prisma operations, including a cached delegate, inside the active callback', async () => {
    const cachedRootCount = prisma.workOrder.count;

    await withSecurityContext(harness.client, fullContext, async () => {
      expect(() => cachedRootCount()).toThrow(/ROOT_PRISMA_ESCAPE/);
      expect(() => prisma.workOrder.count()).toThrow(/ROOT_PRISMA_ESCAPE/);
      expect(() => prisma.$queryRaw`SELECT 1`).toThrow(/ROOT_PRISMA_ESCAPE/);
    });
  });
});
