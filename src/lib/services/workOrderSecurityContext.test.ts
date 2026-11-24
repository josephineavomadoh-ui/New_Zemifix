import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth';

const mocks = vi.hoisted(() => {
  const tx = {
    userScopeGrant: { findMany: vi.fn(async () => []) },
    branch: {
      findUnique: vi.fn(async () => ({ path: '/HQ/' })),
      findMany: vi.fn(async () => []),
    },
    workOrder: { findMany: vi.fn(async () => []) },
  };
  return {
    tx,
    withSecurityContext: vi.fn(async (_context: unknown, callback: (transaction: object) => Promise<unknown>) =>
      callback(tx)
    ),
  };
});

vi.mock('./securityContextService', () => ({
  withSecurityContext: mocks.withSecurityContext,
}));
vi.mock('../uuid', () => ({ generateUuidV7: vi.fn() }));
vi.mock('./auditService', () => ({ appendAuditLog: vi.fn() }));
vi.mock('./notificationService', () => ({
  notifyStaff: vi.fn(),
  notifyCustomerContact: vi.fn(),
}));

import { getWorkOrders } from './workOrderService';

describe('work-order security transaction integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs scope lookup and protected work-order query in the same signed context transaction', async () => {
    const user: AuthenticatedUser = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Test User',
      email: 'test@example.invalid',
      roleId: '22222222-2222-4222-8222-222222222222',
      role: { id: '22222222-2222-4222-8222-222222222222', name: 'Technician' },
      branchId: '33333333-3333-4333-8333-333333333333',
      branch: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'HQ',
        code: 'HQ',
        type: 'HeadOffice',
        path: '/HQ/',
      },
      departmentId: '44444444-4444-4444-8444-444444444444',
      accessScope: 'Company',
      isActive: true,
      locale: 'en-GH',
    };

    await getWorkOrders(user);

    expect(mocks.withSecurityContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        branchId: user.branchId,
        branchPath: '/HQ/',
        departmentId: user.departmentId,
        accessScope: 'Company',
        realm: 'STAFF',
      }),
      expect.any(Function)
    );
    expect(mocks.tx.userScopeGrant.findMany).toHaveBeenCalled();
    expect(mocks.tx.branch.findUnique).toHaveBeenCalled();
    expect(mocks.tx.workOrder.findMany).toHaveBeenCalled();
  });
});
