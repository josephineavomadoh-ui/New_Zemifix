import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.TEST_DATABASE_URL =
    'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
  process.env.APP_CONTEXT_HMAC_SECRET =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
});

import { GET as getInvoicesRoute, POST as createInvoiceRoute } from '@/src/app/api/finance/invoices/route';
import { POST as recordPaymentRoute } from '@/src/app/api/finance/payments/route';
import { POST as issueCreditNoteRoute } from '@/src/app/api/finance/credit-notes/route';
import { createInvoice, approveInvoice, recordPaymentRemittance, issueCreditNote } from '@/src/lib/services/billingService';
import { withSecurityContext, SecurityContextInput } from '@/src/lib/services/securityContextService';
import type { AuthenticatedUser } from '@/src/lib/auth';
import { Prisma, PrismaClient } from '@prisma/client';

describe('Stage 3 Increment 2B6.1: Finance Security & Financial Integrity Corrections', () => {
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
      name: 'Finance Manager',
      email: 'finance@zemifix.com',
      roleId: '22222222-2222-4222-8222-222222222222',
      role: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Finance Officer',
        permissions: [
          { permission: { resource: 'invoice', action: 'read' } },
          { permission: { resource: 'invoice', action: 'create' } },
          { permission: { resource: 'invoice', action: 'approve' } },
        ],
      },
      branchId: '33333333-3333-4333-8333-333333333333',
      branch: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'HQ Branch',
        code: 'HQ-ACC',
        type: 'HeadOffice',
        path: '/HQ-ACC/',
      },
      departmentId: '44444444-4444-4444-8444-444444444444',
      accessScope: 'Company',
      isActive: true,
      locale: 'en-GH',
      ...overrides,
    };
  }

  function createMockTx() {
    const defaultCustomer = {
      id: 'cust-1',
      name: 'Acme Corp',
      customerNumber: 'CUST-001',
    };

    const defaultInvoice = {
      id: 'inv-100',
      draftReference: 'DRAFT-INV-2026-000001',
      invoiceNumber: 'INV-2026-000101',
      customerId: 'cust-1',
      siteId: null,
      subtotal: new Prisma.Decimal(100),
      vatAmount: new Prisma.Decimal(15),
      nhilAmount: new Prisma.Decimal(2.5),
      getFundAmount: new Prisma.Decimal(2.5),
      totalAmount: new Prisma.Decimal(120),
      paidAmount: new Prisma.Decimal(0),
      creditedAmount: new Prisma.Decimal(0),
      balanceDue: new Prisma.Decimal(120),
      status: 'DRAFT',
      createdByUserId: '11111111-1111-4111-8111-111111111111', // Creator ID
      createdAt: new Date(),
    };

    const creatorUser = {
      id: '11111111-1111-4111-8111-111111111111',
      branchId: '33333333-3333-4333-8333-333333333333',
      departmentId: '44444444-4444-4444-8444-444444444444',
      accessScope: 'Company',
      isActive: true,
      deletedAt: null,
    };

    const mockTemplate = {
      id: 'tmpl-1',
      isActive: true,
      titleTemplate: 'Invoice Approved {{invoiceNumber}}',
      bodyTemplate: 'Body',
      emailSubject: 'Subject',
      emailBody: 'Email Body',
    };

    const mockPreference = {
      inAppEnabled: true,
      emailEnabled: false,
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
        if (sql.includes('FOR UPDATE')) {
          if (sql.includes('number_sequences')) {
            return [{ id: 'seq-1', nextValue: 101 }];
          }
          if (sql.includes('invoices')) {
            return [{
              id: defaultInvoice.id,
              customerId: defaultInvoice.customerId,
              siteId: null,
              status: defaultInvoice.status,
              totalAmount: '120.00',
              paidAmount: '0.00',
              creditedAmount: '0.00',
              balanceDue: '120.00',
              createdByUserId: defaultInvoice.createdByUserId,
              invoiceNumber: defaultInvoice.invoiceNumber,
              draftReference: defaultInvoice.draftReference,
            }];
          }
        }
        return [];
      }),
      $executeRaw: vi.fn().mockResolvedValue(1),
      customer: {
        findUnique: vi.fn().mockResolvedValue(defaultCustomer),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(creatorUser),
        findFirst: vi.fn().mockResolvedValue(creatorUser),
      },
      userScopeGrant: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({ path: '/HQ-ACC/', managerUserId: null }),
      },
      numberSequence: {
        findUnique: vi.fn().mockResolvedValue({ id: 'seq-1', prefix: 'INV-2026', nextValue: 101 }),
        create: vi.fn().mockResolvedValue({ id: 'seq-1', prefix: 'INV-2026', nextValue: 1 }),
        update: vi.fn().mockResolvedValue({ id: 'seq-1', prefix: 'INV-2026', nextValue: 102 }),
      },
      invoice: {
        findMany: vi.fn().mockResolvedValue([defaultInvoice]),
        findUnique: vi.fn().mockResolvedValue(defaultInvoice),
        create: vi.fn().mockResolvedValue(defaultInvoice),
        update: vi.fn().mockResolvedValue({ ...defaultInvoice, status: 'APPROVED', invoiceNumber: 'INV-2026-000101' }),
      },
      payment: {
        create: vi.fn().mockResolvedValue({ id: 'pay-1', paymentNumber: 'PAY-2026-000001' }),
      },
      creditNote: {
        create: vi.fn().mockResolvedValue({ id: 'cn-1', creditNoteNumber: 'CN-2026-000001' }),
      },
      notificationTemplate: {
        findUnique: vi.fn().mockResolvedValue(mockTemplate),
        findFirst: vi.fn().mockResolvedValue(mockTemplate),
      },
      notificationPreference: {
        findUnique: vi.fn().mockResolvedValue(mockPreference),
      },
      notification: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as unknown as Prisma.TransactionClient;

    const client = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as PrismaClient;

    return { client, tx, defaultInvoice, defaultCustomer };
  }

  it('1. Executes createInvoice with tx parameter cleanly inside signed transaction', async () => {
    const user = createMockUser();
    const { client, tx, defaultInvoice } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch.path ?? '',
      departmentId: user.departmentId,
      accessScope: 'Company',
      realm: 'STAFF',
    };

    const invData = {
      customerId: 'cust-1',
      dueDate: new Date(),
      items: [{ description: 'Maintenance Fee', quantity: 1, unitPrice: 100 }],
    };

    const invoice = await withSecurityContext(client, secContext, async (activeTx) => {
      return await createInvoice(user, invData, activeTx);
    });

    expect(invoice).toEqual(defaultInvoice);
    expect(tx.invoice.create).toHaveBeenCalled();
  });

  it('2. Rejects creator self-approval attempt on approveInvoice (MAKER_CHECKER_VIOLATION)', async () => {
    const creatorUser = createMockUser({ id: '11111111-1111-4111-8111-111111111111' });
    const { client } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: creatorUser.id,
      branchId: creatorUser.branchId,
      branchPath: creatorUser.branch.path ?? '',
      departmentId: creatorUser.departmentId,
      accessScope: 'Company',
      realm: 'STAFF',
    };

    return expect(
      withSecurityContext(client, secContext, async (activeTx) => {
        return await approveInvoice(creatorUser, 'inv-100', activeTx);
      })
    ).rejects.toThrowError(/MAKER_CHECKER_VIOLATION.*creator cannot approve their own/i);
  });

  it('3. Allows invoice approval by a different checker user', async () => {
    const checkerUser = createMockUser({ id: '88888888-8888-4888-8888-888888888888' });
    const { client, tx } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: checkerUser.id,
      branchId: checkerUser.branchId,
      branchPath: checkerUser.branch.path ?? '',
      departmentId: checkerUser.departmentId,
      accessScope: 'Company',
      realm: 'STAFF',
    };

    const approved = await withSecurityContext(client, secContext, async (activeTx) => {
      return await approveInvoice(checkerUser, 'inv-100', activeTx);
    });

    expect(approved.status).toBe('APPROVED');
    expect(tx.invoice.update).toHaveBeenCalled();
  });

  it('4. Rejects unauthenticated request on GET /api/finance/invoices (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/finance/invoices', {
      method: 'GET',
    });

    const res = await getInvoicesRoute(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
  });

  it('5. Rejects unauthenticated request on POST /api/finance/payments (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/finance/payments', {
      method: 'POST',
      body: JSON.stringify({ customerId: 'c-1', invoiceId: 'i-1', amount: 100 }),
    });

    const res = await recordPaymentRoute(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
  });
});
