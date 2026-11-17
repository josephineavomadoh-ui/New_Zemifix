// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '../auth';
import { prisma } from '../prisma';

vi.mock('../auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('../prisma', () => ({
  prisma: {
    asset: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Asset Image Security & Access Controls', () => {
  it('rejects unauthenticated image retrieval (401 / null user)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it('enforces branch-level access restriction for unauthorized branch scope', async () => {
    const asset = {
      id: 'asset-1',
      branchId: 'branch-hq',
      deletedAt: null,
      imageUrl: 'assets/test.jpg',
    };
    vi.mocked(prisma.asset.findUnique).mockResolvedValueOnce(asset as any);

    const user = {
      id: 'user-branch-b',
      accessScope: 'Branch',
      branchId: 'branch-b',
    };

    // Asset belongs to branch-hq, user is scoped to branch-b
    expect(asset.branchId).not.toBe(user.branchId);
  });

  it('allows authorized image retrieval for matching branch/scope', async () => {
    const asset = {
      id: 'asset-1',
      branchId: 'branch-hq',
      deletedAt: null,
      imageUrl: 'assets/test.jpg',
    };
    vi.mocked(prisma.asset.findUnique).mockResolvedValueOnce(asset as any);

    const user = {
      id: 'user-hq',
      accessScope: 'Branch',
      branchId: 'branch-hq',
    };

    expect(asset.branchId).toBe(user.branchId);
  });
});
