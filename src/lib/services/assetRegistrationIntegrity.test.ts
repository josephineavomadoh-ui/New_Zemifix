import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createAsset } from './assetService';

const accDbUrl = 'postgresql://postgres:javvy@localhost:5432/zemifix_acceptance?schema=public';
const prisma = new PrismaClient({
  datasources: { db: { url: accDbUrl } },
});

describe('Asset Registration Integrity & Managing Organization Fallback (Sub-stage Fix)', () => {
  beforeAll(async () => {
    const res = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    if (res[0]?.current_database !== 'zemifix_acceptance') {
      throw new Error(`Asset registration tests MUST run against zemifix_acceptance! Found: ${res[0]?.current_database}`);
    }
  });

  it('Scenario 1: INTERNAL_BRANCH with branchId supplied and managingBranchId omitted defaults managingBranchId to branchId and succeeds', async () => {
    const branchHQ = await prisma.branch.findFirst({ where: { code: 'HQ-ACC' } });
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@zemifix.local' } });
    const category = await prisma.assetCategory.findFirst();

    expect(branchHQ).toBeDefined();
    expect(adminUser).toBeDefined();
    expect(category).toBeDefined();

    let location = await prisma.location.findFirst({ where: { branchId: branchHQ!.id } });
    if (!location) {
      location = await prisma.location.create({
        data: { code: 'LOC-REG-01', name: 'Registration Test Location', branchId: branchHQ!.id },
      });
    }

    // Omit managingBranchId and managingOrgType
    const asset = await createAsset({
      assetTag: `AS001-${Date.now()}`,
      name: 'Air Condition',
      categoryId: category!.id,
      branchId: branchHQ!.id,
      locationId: location.id,
      createdByUserId: adminUser!.id,
    });

    expect(asset.id).toBeDefined();
    expect(asset.managingOrgType).toBe('INTERNAL_BRANCH');
    expect(asset.managingBranchId).toBe(branchHQ!.id);
  });

  it('Scenario 2: INTERNAL_BRANCH with explicit managingBranchId preserves explicit value', async () => {
    const branchHQ = await prisma.branch.findFirst({ where: { code: 'HQ-ACC' } });
    const branchTema = await prisma.branch.findFirst({ where: { code: 'REG-TEMA' } });
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@zemifix.local' } });
    const category = await prisma.assetCategory.findFirst();

    let location = await prisma.location.findFirst({ where: { branchId: branchHQ!.id } });
    if (!location) {
      location = await prisma.location.create({
        data: { code: 'LOC-REG-01', name: 'Registration Test Location', branchId: branchHQ!.id },
      });
    }

    const asset = await createAsset({
      assetTag: `AS002-${Date.now()}`,
      name: 'Chiller Unit',
      categoryId: category!.id,
      branchId: branchHQ!.id,
      locationId: location.id,
      managingBranchId: branchTema!.id, // Explicit managing branch
      createdByUserId: adminUser!.id,
    });

    expect(asset.managingBranchId).toBe(branchTema!.id);
  });

  it('Scenario 3: INTERNAL_BRANCH without branchId or managingBranchId returns clean validation error ASSET_REGISTRATION_INVALID', async () => {
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@zemifix.local' } });
    const category = await prisma.assetCategory.findFirst();

    await expect(
      createAsset({
        assetTag: `AS003-${Date.now()}`,
        name: 'Unassigned Asset',
        categoryId: category!.id,
        branchId: null,
        managingBranchId: null,
        createdByUserId: adminUser!.id,
      })
    ).rejects.toThrowError(/ASSET_REGISTRATION_INVALID/);
  });

  it('Scenario 4: EXTERNAL_CONTRACTOR requires managingCustomerId and sets managingBranchId to null', async () => {
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@zemifix.local' } });
    const category = await prisma.assetCategory.findFirst();

    let customer = await prisma.customer.findFirst();
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          customerNumber: `CUST-EXT-${Date.now()}`,
          name: 'External Contractor Corp',
          primaryEmail: `ext_${Date.now()}@contractor.com`,
          primaryPhone: '+233240009988',
          billingAddress: 'Accra, Ghana',
        },
      });
    }

    const asset = await createAsset({
      assetTag: `AS004-${Date.now()}`,
      name: 'Leased Transformer Unit',
      categoryId: category!.id,
      managingOrgType: 'EXTERNAL_CONTRACTOR',
      managingCustomerId: customer.id,
      createdByUserId: adminUser!.id,
    });

    expect(asset.managingOrgType).toBe('EXTERNAL_CONTRACTOR');
    expect(asset.managingBranchId).toBeNull();
    expect(asset.managingCustomerId).toBe(customer.id);
  });
});
