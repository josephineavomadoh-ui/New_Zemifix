import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { getBranches, getDepartments } from './organizationService';
import { createLocation } from './locationService';

const accDbUrl = 'postgresql://postgres:javvy@localhost:5432/zemifix_acceptance?schema=public';
const prisma = new PrismaClient({
  datasources: { db: { url: accDbUrl } },
});

describe('Location Creation & Organization Dropdown Filtering Correction', () => {
  beforeAll(async () => {
    const res = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    if (res[0]?.current_database !== 'zemifix_acceptance') {
      throw new Error(`Correction test MUST run against zemifix_acceptance! Found: ${res[0]?.current_database}`);
    }
  });

  it('1. getBranches() returns ONLY active and non-deleted branches', async () => {
    const result = await getBranches();
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);

    for (const branch of result.data) {
      expect(branch.isActive).toBe(true);
      expect(branch.deletedAt).toBeNull();
    }
  });

  it('2. getDepartments() returns ONLY active and non-deleted departments', async () => {
    const result = await getDepartments();
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);

    for (const dept of result.data) {
      expect(dept.isActive).toBe(true);
      expect(dept.deletedAt).toBeNull();
    }
  });

  it('3 & 4. Creating a location under an active branch with a new unique code succeeds', async () => {
    const activeBranch = await prisma.branch.findFirst({ where: { isActive: true, deletedAt: null } });
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    expect(activeBranch).toBeDefined();
    expect(adminUser).toBeDefined();

    const newCode = `LOC-UNIQ-${Date.now()}`;
    const newLocation = await createLocation({
      branchId: activeBranch!.id,
      code: newCode,
      name: 'Unique Test Location',
      building: 'Building A',
      createdByUserId: adminUser!.id,
    });

    expect(newLocation.id).toBeDefined();
    expect(newLocation.code).toBe(newCode);
    expect(newLocation.branchId).toBe(activeBranch!.id);
  });

  it('5. Active duplicate code under the same branch returns LOCATION_CODE_EXISTS error', async () => {
    const activeBranch = await prisma.branch.findFirst({ where: { isActive: true, deletedAt: null } });
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    const dupCode = `LOC-DUP-${Date.now()}`;

    // First creation
    await createLocation({
      branchId: activeBranch!.id,
      code: dupCode,
      name: 'First Active Location',
      createdByUserId: adminUser!.id,
    });

    // Duplicate creation attempt
    await expect(
      createLocation({
        branchId: activeBranch!.id,
        code: dupCode,
        name: 'Second Active Location',
        createdByUserId: adminUser!.id,
      })
    ).rejects.toThrowError(/LOCATION_CODE_EXISTS/);
  });

  it('6. Soft-deleted duplicate code under the same branch returns LOCATION_CODE_RESERVED error without auto-reactivating', async () => {
    const activeBranch = await prisma.branch.findFirst({ where: { isActive: true, deletedAt: null } });
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    const archivedCode = `LOC-ARC-${Date.now()}`;

    // Create and soft-delete a location
    const tempLoc = await createLocation({
      branchId: activeBranch!.id,
      code: archivedCode,
      name: 'To Be Soft Deleted',
      createdByUserId: adminUser!.id,
    });

    await prisma.location.update({
      where: { id: tempLoc.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    // Re-creation attempt using same code
    await expect(
      createLocation({
        branchId: activeBranch!.id,
        code: archivedCode,
        name: 'Attempt Reuse Archived Code',
        createdByUserId: adminUser!.id,
      })
    ).rejects.toThrowError(/LOCATION_CODE_RESERVED/);

    // Verify the archived record was NOT reactivated
    const checkArchived = await prisma.location.findUnique({ where: { id: tempLoc.id } });
    expect(checkArchived?.deletedAt).not.toBeNull();
  });

  it('7. Attempting creation under an inactive branch returns BRANCH_INACTIVE error', async () => {
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    // Create an inactive branch
    const inactiveBranch = await prisma.branch.create({
      data: {
        code: `INACT-${Date.now().toString().slice(-6)}`,
        name: 'Inactive Branch Test',
        isActive: false,
        path: '/INACT/',
      },
    });

    await expect(
      createLocation({
        branchId: inactiveBranch.id,
        code: `LOC-FAIL-${Date.now()}`,
        name: 'Location Under Inactive Branch',
        createdByUserId: adminUser!.id,
      })
    ).rejects.toThrowError(/BRANCH_INACTIVE/);
  });
});
