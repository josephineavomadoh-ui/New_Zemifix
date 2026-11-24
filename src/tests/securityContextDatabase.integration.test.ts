import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';

const enabled = process.env.RUN_SECURITY_CONTEXT_PG_INTEGRATION === 'true';

type TamperingCase = {
  guc: string;
  replacement: string;
  readContext: (tx: Prisma.TransactionClient) => Promise<Array<{ value: string | null }>>;
};

const tamperingCases: TamperingCase[] = [
  {
    guc: 'app.current_user_id',
    replacement: '77777777-7777-4777-8777-777777777777',
    readContext: (tx) => tx.$queryRaw`SELECT public.app_user_id() AS "value"`,
  },
  {
    guc: 'app.current_access_scope',
    replacement: 'Company',
    readContext: (tx) => tx.$queryRaw`SELECT public.app_access_scope() AS "value"`,
  },
  {
    guc: 'app.current_company_id',
    replacement: '88888888-8888-4888-8888-888888888888',
    readContext: (tx) => tx.$queryRaw`SELECT public.app_company_id() AS "value"`,
  },
];

describe.skipIf(!enabled)('Signed security context (safe PostgreSQL integration)', () => {
  it('fails closed through RLS context helpers after a transaction GUC is tampered with', async () => {
    const databaseUrl = process.env.APP_DATABASE_URL;
    if (process.env.APP_ENV !== 'development' || !databaseUrl) {
      throw new Error(
        'Integration test requires APP_ENV=development and APP_DATABASE_URL targeting zemifix_dev.'
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(databaseUrl);
    } catch {
      throw new Error('Integration test database URL is malformed.');
    }

    const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
    const username = decodeURIComponent(parsedUrl.username);
    if (
      !['postgres:', 'postgresql:'].includes(parsedUrl.protocol) ||
      databaseName !== 'zemifix_dev' ||
      username !== 'zemifix_app_user' ||
      parsedUrl.searchParams.has('host') ||
      parsedUrl.searchParams.has('hostaddr') ||
      parsedUrl.searchParams.has('dbname') ||
      parsedUrl.searchParams.has('database') ||
      parsedUrl.searchParams.has('user')
    ) {
      throw new Error(
        'Integration test is restricted to the zemifix_app_user role on zemifix_dev.'
      );
    }

    const encodedKey = process.env.APP_CONTEXT_HMAC_SECRET;
    const key = encodedKey ? Buffer.from(encodedKey, 'base64') : Buffer.alloc(0);
    if (key.length !== 32 || key.toString('base64') !== encodedKey) {
      throw new Error('Integration test requires a canonical 32-byte APP_CONTEXT_HMAC_SECRET.');
    }

    const { withSecurityContext } = await import('../lib/services/securityContextService');
    const context = {
      userId: '11111111-1111-4111-8111-111111111111',
      branchId: '22222222-2222-4222-8222-222222222222',
      branchPath: '/HQ-ACC/',
      departmentId: '33333333-3333-4333-8333-333333333333',
      accessScope: 'BranchAndBelow' as const,
      realm: 'STAFF' as const,
      customerId: '',
      taskId: '',
      taskType: 'SECURITY_CONTEXT_INTEGRATION',
      companyId: '66666666-6666-4666-8666-666666666666',
    };

    for (const tamperingCase of tamperingCases) {
      await withSecurityContext(context, async (tx) => {
        const [before] = await tx.$queryRaw<Array<{ valid: boolean }>>`
          SELECT public.app_security_context_valid() AS "valid";
        `;
        expect(before?.valid).toBe(true);

        await tx.$queryRaw`
          SELECT set_config(${tamperingCase.guc}, ${tamperingCase.replacement}, true);
        `;

        const [after] = await tx.$queryRaw<Array<{ valid: boolean }>>`
          SELECT public.app_security_context_valid() AS "valid";
        `;
        const [observed] = await tamperingCase.readContext(tx);
        expect(after?.valid).toBe(false);
        expect(observed?.value).toBeNull();
      });
    }
  });
});
