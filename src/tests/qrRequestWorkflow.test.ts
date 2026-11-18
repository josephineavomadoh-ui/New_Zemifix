// @vitest-environment node
/**
 * Integration Test Suite for Public QR Maintenance Request Feature (Phase 7)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { generateUuidV7 } from '../lib/uuid';
import { submitPublicQrRequest } from '../lib/services/portalService';
import {
  getPublicRequestIntakes,
  processPublicRequestIntake,
} from '../lib/services/workRequestService';
import { prisma } from '../lib/prisma';

describe('Public QR Maintenance Request & Planner Conversion Workflow', () => {
  let testSite: any;
  let testAsset: any;
  let testAdminUser: any;

  beforeEach(async () => {
    // 1. Fetch or create test customer & site in zemifix_dev
    let customer = await prisma.customer.findFirst({ where: { deletedAt: null } });
    if (!customer) {
      const code = `CUST-QR-${Date.now().toString().slice(-4)}`;
      customer = await prisma.customer.create({
        data: {
          id: generateUuidV7(),
          customerNumber: code,
          name: 'QR Test Customer Ltd',
          billingAddress: 'Tarkwa Industrial Park, Ghana',
          primaryPhone: '0244000000',
          primaryEmail: 'info@qrtest.com',
        },
      });
    }

    const siteCode = `STE-QR-${Date.now().toString().slice(-6)}`;
    testSite = await prisma.customerSite.create({
      data: {
        id: generateUuidV7(),
        customerId: customer.id,
        siteCode,
        name: 'Tarkwa Gold Mining Site',
        address: 'Tarkwa Industrial Zone, Western Region',
        isActive: true,
      },
    });

    const category = await prisma.assetCategory.findFirst({ where: { deletedAt: null } });
    const categoryId = category ? category.id : generateUuidV7();
    const hqBranch = await prisma.branch.findFirst({ where: { deletedAt: null } });
    if (!hqBranch) throw new Error('Missing seed Branch');

    const assetTag = `AST-QR-${Date.now().toString().slice(-6)}`;
    testAsset = await prisma.asset.create({
      data: {
        id: generateUuidV7(),
        assetTag,
        name: 'Main Substation Transformer 01',
        categoryId,
        siteId: testSite.id,
        physicalSiteCustomerId: customer.id,
        managingOrgType: 'INTERNAL_BRANCH',
        managingBranchId: hqBranch.id,
        status: 'OPERATIONAL',
        isActive: true,
      },
    });

    // 2. Fetch or create test Planner Admin User
    const existingUser = await prisma.user.findFirst({ where: { deletedAt: null, isActive: true } });
    if (existingUser) {
      testAdminUser = existingUser;
    } else {
      const adminRole = await prisma.role.findFirst({ where: { name: 'Admin' } });
      if (!adminRole) throw new Error('Missing seed Admin role');

      testAdminUser = await prisma.user.create({
        data: {
          id: generateUuidV7(),
          name: 'Planner Test User',
          email: `planner.qr.${Date.now()}@zemifix.local`,
          passwordHash: 'dummy-hash',
          roleId: adminRole.id,
          branchId: hqBranch.id,
          accessScope: 'Company',
          isActive: true,
        },
      });
    }
  });

  it('1. Submits unauthenticated public QR request and stores record with status RECEIVED', async () => {
    const intake = await submitPublicQrRequest({
      siteCode: testSite.siteCode,
      assetTag: testAsset.assetTag,
      requesterName: 'Kwame Mensah',
      requesterEmail: 'kwame.mensah@example.com',
      requesterPhone: '0244111222',
      description: 'Overheating transformer primary winding observed on site inspection',
      photoUrl: '/api/public/uploads/test-photo.jpg',
      clientIp: `192.168.1.${Math.floor(Math.random() * 200)}`,
      idempotencyKey: `idemp-qr-${Date.now()}`,
    });

    expect(intake).toBeDefined();
    expect(intake.id).toBeDefined();
    expect(intake.status).toBe('RECEIVED');
    expect(intake.siteId).toBe(testSite.id);
    expect(intake.assetId).toBe(testAsset.id);
    expect(intake.requesterName).toBe('Kwame Mensah');
    expect(intake.photoUrl).toBe('/api/public/uploads/test-photo.jpg');
  });

  it('2. Rejects public submission for invalid site code', async () => {
    await expect(
      submitPublicQrRequest({
        siteCode: 'INVALID-NON-EXISTENT-SITE-CODE',
        requesterName: 'Kofi Badu',
        requesterEmail: 'kofi@example.com',
        requesterPhone: '0244333444',
        description: 'Fault observed',
        clientIp: '127.0.0.1',
      })
    ).rejects.toThrow('INVALID_SITE_REFERENCE');
  });

  it('3. Rejects public submission for invalid asset tag', async () => {
    await expect(
      submitPublicQrRequest({
        siteCode: testSite.siteCode,
        assetTag: 'AST-NON-EXISTENT-TAG-999',
        requesterName: 'Ama Osei',
        requesterEmail: 'ama@example.com',
        requesterPhone: '0244555666',
        description: 'Leaking oil from gear box',
        clientIp: '127.0.0.1',
      })
    ).rejects.toThrow('INVALID_ASSET_REFERENCE');
  });

  it('4. Allows Planner to retrieve incoming public intake items', async () => {
    await submitPublicQrRequest({
      siteCode: testSite.siteCode,
      assetTag: testAsset.assetTag,
      requesterName: 'Esi Mansa',
      requesterEmail: 'esi@example.com',
      requesterPhone: '0244777888',
      description: 'Vibration in primary bearing assembly',
      clientIp: `10.0.0.${Math.floor(Math.random() * 200)}`,
      idempotencyKey: `idemp-esi-${Date.now()}`,
    });

    const intakes = await getPublicRequestIntakes(testAdminUser);
    expect(intakes.length).toBeGreaterThan(0);
    const target = intakes.find((i) => i.requesterName === 'Esi Mansa');
    expect(target).toBeDefined();
    expect(target?.status).toBe('RECEIVED');
  });

  it('5. Converts public intake item into active Work Order and updates intake status to PROCESSED', async () => {
    const intake = await submitPublicQrRequest({
      siteCode: testSite.siteCode,
      assetTag: testAsset.assetTag,
      requesterName: 'Yaw Boateng',
      requesterEmail: 'yaw.boateng@example.com',
      requesterPhone: '0244888999',
      description: 'Cooling fan motor failure on Transformer 01',
      photoUrl: '/api/public/uploads/fan-failure.jpg',
      clientIp: `172.16.0.${Math.floor(Math.random() * 200)}`,
      idempotencyKey: `idemp-yaw-${Date.now()}`,
    });

    const reviewResult = await processPublicRequestIntake(testAdminUser, {
      intakeId: intake.id,
      action: 'CONVERT',
      priority: 'HIGH',
    });

    expect(reviewResult).toBeDefined();
    expect(reviewResult.intake.status).toBe('PROCESSED');
    expect(reviewResult.workOrder).toBeDefined();
    expect(reviewResult.workOrder.workOrderNumber).toMatch(/^WO-\d{4}-\d{6}$/);
    expect(reviewResult.workOrder.status).toBe('OPEN');
    expect(reviewResult.workOrder.assetId).toBe(testAsset.id);
    expect(reviewResult.workOrder.siteId).toBe(testSite.id);

    // Verify converted work order is in database
    const dbWo = await prisma.workOrder.findUnique({
      where: { id: reviewResult.workOrder.id },
      include: { attachments: true },
    });
    expect(dbWo).toBeDefined();
    expect(dbWo?.attachments.length).toBe(1);
    expect(dbWo?.attachments[0].fileName).toBe('[BEFORE] Public Fault Photo');
  });

  it('6. Prevents duplicate Work Order creation when public intake is re-processed', async () => {
    const intake = await submitPublicQrRequest({
      siteCode: testSite.siteCode,
      assetTag: testAsset.assetTag,
      requesterName: 'Abena Owusu',
      requesterEmail: 'abena@example.com',
      requesterPhone: '0244000111',
      description: 'High pressure alarm triggered',
      clientIp: `192.168.2.${Math.floor(Math.random() * 200)}`,
      idempotencyKey: `idemp-abena-${Date.now()}`,
    });

    await processPublicRequestIntake(testAdminUser, {
      intakeId: intake.id,
      action: 'CONVERT',
    });

    // Attempt second conversion
    await expect(
      processPublicRequestIntake(testAdminUser, {
        intakeId: intake.id,
        action: 'CONVERT',
      })
    ).rejects.toThrow('FINALIZED_INTAKE');
  });

  it('7. Submits public QR request for internal branch asset (siteId null, branchId set) and converts to Work Order', async () => {
    const hqBranch = await prisma.branch.findFirst({ where: { deletedAt: null } });
    const category = await prisma.assetCategory.findFirst({ where: { deletedAt: null } });

    const testLocation = await prisma.location.create({
      data: {
        id: generateUuidV7(),
        code: `LOC-TEST-${Date.now().toString().slice(-4)}`,
        name: 'Main Switchroom',
        branchId: hqBranch!.id,
      },
    });

    const internalAsset = await prisma.asset.create({
      data: {
        id: generateUuidV7(),
        assetTag: `AST-INT-${Date.now().toString().slice(-6)}`,
        name: 'Internal Switchgear 02',
        categoryId: category!.id,
        branchId: hqBranch!.id,
        locationId: testLocation.id,
        managingOrgType: 'INTERNAL_BRANCH',
        managingBranchId: hqBranch!.id,
        status: 'OPERATIONAL',
        isActive: true,
      },
    });

    const intake = await submitPublicQrRequest({
      assetTag: internalAsset.assetTag,
      requesterName: 'Kojo Appiah',
      requesterEmail: 'kojo@zemifix.local',
      requesterPhone: '0244999888',
      description: 'Internal panel trip observed',
      clientIp: '127.0.0.1',
      idempotencyKey: `idemp-internal-${Date.now()}`,
    });

    expect(intake).toBeDefined();
    expect(intake.status).toBe('RECEIVED');
    expect(intake.siteId).toBeNull();
    expect(intake.branchId).toBe(hqBranch!.id);
    expect(intake.assetId).toBe(internalAsset.id);

    const reviewResult = await processPublicRequestIntake(testAdminUser, {
      intakeId: intake.id,
      action: 'CONVERT',
    });

    expect(reviewResult.intake.status).toBe('PROCESSED');
    expect(reviewResult.workOrder.siteId).toBeNull();
    expect(reviewResult.workOrder.branchId).toBe(hqBranch!.id);
    expect(reviewResult.workOrder.assetId).toBe(internalAsset.id);
  });
});
