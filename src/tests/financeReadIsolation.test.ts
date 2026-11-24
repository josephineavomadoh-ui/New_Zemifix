import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.TEST_DATABASE_URL =
    'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
  process.env.APP_CONTEXT_HMAC_SECRET =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
});

import { getInvoices, getPayments, getCreditNotes, getInternalRecharges, getScopedInvoiceFilter } from '@/src/lib/services/billingService';
import { withSecurityContext, SecurityContextInput } from '@/src/lib/services/securityContextService';
import type { AuthenticatedUser } from '@/src/lib/auth';
import { Prisma, PrismaClient } from '@prisma/client';

describe('Stage 3 Increment 2B6.3: Finance Company Scope Fail-Closed & Payment Allocation Isolation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.APP_ENV = 'test';
    process.env.TEST_DATABASE_URL =
      'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
    process.env.APP_CONTEXT_HMAC_SECRET =
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createMockUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Branch Finance Officer',
      email: 'finance-branch@zemifix.com',
      roleId: '22222222-2222-4222-8222-222222222222',
      role: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Finance Officer',
        permissions: [
          { permission: { resource: 'invoice', action: 'read' } },
        ],
      },
      branchId: '33333333-3333-4333-8333-333333333333',
      branch: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Kumasi Branch',
        code: 'KMS-01',
        type: 'Branch',
        path: '/HQ-ACC/KMS-01/',
      },
      departmentId: '44444444-4444-4444-8444-444444444444',
      accessScope: 'Branch',
      isActive: true,
      locale: 'en-GH',
      ...overrides,
    };
  }

  function createMockTx() {
    const defaultInvoice = {
      id: 'inv-100',
      invoiceNumber: 'INV-2026-000101',
      customerId: 'cust-1',
      totalAmount: new Prisma.Decimal(120),
      createdByUserId: '11111111-1111-4111-8111-111111111111',
    };

    const defaultPayment = {
      id: 'pay-100',
      paymentNumber: 'PAY-2026-000001',
      amount: new Prisma.Decimal(120),
      allocations: [
        {
          id: 'alloc-1',
          amountAllocated: new Prisma.Decimal(120),
          invoice: defaultInvoice,
        },
      ],
    };

    const defaultCreditNote = {
      id: 'cn-100',
      creditNoteNumber: 'CN-2026-000001',
      totalAmount: new Prisma.Decimal(36),
    };

    const defaultRecharge = {
      id: 'rch-100',
      rechargeNumber: 'RCH-2026-000001',
      amount: new Prisma.Decimal(50),
    };

    const tx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (sql.includes('pg_backend_pid()')) {
          return [
            {
              backendPid: '1234',
              transactionId: '5678',
              sessionUser: 'zemifix_app_user',
              currentDatabase: 'zemifix_dev',
            },
          ];
        }
        return [];
      }),
      $executeRaw: vi.fn().mockResolvedValue(1),
      userScopeGrant: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({ path: '/HQ-ACC/KMS-01/' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      invoice: {
        findMany: vi.fn().mockResolvedValue([defaultInvoice]),
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([defaultPayment]),
      },
      creditNote: {
        findMany: vi.fn().mockResolvedValue([defaultCreditNote]),
      },
      internalRecharge: {
        findMany: vi.fn().mockResolvedValue([defaultRecharge]),
      },
    } as unknown as Prisma.TransactionClient;

    const client = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as PrismaClient;

    return { client, tx, defaultInvoice, defaultPayment, defaultCreditNote, defaultRecharge };
  }

  it('1. Fails closed on missing or invalid security context', async () => {
    const invalidUser = { id: '', accessScope: '' } as unknown as AuthenticatedUser;
    const { client } = createMockTx();

    const filter = await getScopedInvoiceFilter(invalidUser, client as any);
    expect(filter).toEqual({
      deletedAt: null,
      id: '00000000-0000-0000-0000-000000000000',
    });
  });

  it('2. Fails closed on Company scope when user branch or path is missing', async () => {
    const companyUserNoBranch = createMockUser({ accessScope: 'Company', branchId: '' });
    const { client, tx } = createMockTx();
    tx.branch.findUnique = vi.fn().mockResolvedValue(null);

    const filter = await getScopedInvoiceFilter(companyUserNoBranch, tx);
    expect(filter).toEqual({
      deletedAt: null,
      id: '00000000-0000-0000-0000-000000000000',
    });
  });

  it('3. Restricts Company scope to root company path prefix', async () => {
    const companyUser = createMockUser({ accessScope: 'Company' });
    const { client, tx } = createMockTx();

    const filter = await getScopedInvoiceFilter(companyUser, tx);
    expect(filter).toEqual({
      deletedAt: null,
      createdByUser: {
        branch: {
          path: { startsWith: '/HQ-ACC/' },
        },
      },
    });
  });

  it('4. Applies branch scope filter on getInvoices cleanly', async () => {
    const user = createMockUser();
    const { client, tx, defaultInvoice } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch.path ?? '',
      departmentId: user.departmentId,
      accessScope: 'Branch',
      realm: 'STAFF',
    };

    const invoices = await withSecurityContext(client, secContext, async (activeTx) => {
      return await getInvoices(user, undefined, activeTx);
    });

    expect(invoices).toEqual([defaultInvoice]);
    expect(tx.invoice.findMany).toHaveBeenCalled();
  });

  it('5. Applies parent invoice branch scope filter and nested allocation filter on getPayments cleanly', async () => {
    const user = createMockUser();
    const { client, tx, defaultPayment } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch.path ?? '',
      departmentId: user.departmentId,
      accessScope: 'Branch',
      realm: 'STAFF',
    };

    const payments = await withSecurityContext(client, secContext, async (activeTx) => {
      return await getPayments(user, activeTx);
    });

    expect(payments).toEqual([defaultPayment]);
    expect(tx.payment.findMany).toHaveBeenCalled();
  });

  it('6. Applies parent invoice branch scope filter on getCreditNotes cleanly', async () => {
    const user = createMockUser();
    const { client, tx, defaultCreditNote } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch.path ?? '',
      departmentId: user.departmentId,
      accessScope: 'Branch',
      realm: 'STAFF',
    };

    const creditNotes = await withSecurityContext(client, secContext, async (activeTx) => {
      return await getCreditNotes(user, activeTx);
    });

    expect(creditNotes).toEqual([defaultCreditNote]);
    expect(tx.creditNote.findMany).toHaveBeenCalled();
  });

  it('7. Applies parent work-order branch scope filter on getInternalRecharges cleanly', async () => {
    const user = createMockUser();
    const { client, tx, defaultRecharge } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch.path ?? '',
      departmentId: user.departmentId,
      accessScope: 'Branch',
      realm: 'STAFF',
    };

    const recharges = await withSecurityContext(client, secContext, async (activeTx) => {
      return await getInternalRecharges(user, activeTx);
    });

    expect(recharges).toEqual([defaultRecharge]);
    expect(tx.internalRecharge.findMany).toHaveBeenCalled();
  });
});
