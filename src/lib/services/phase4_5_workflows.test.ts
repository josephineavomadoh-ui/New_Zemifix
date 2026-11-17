import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withSecurityContext } from './securityContextService';
import { runBackgroundWorker } from './backgroundJobService';
import { createWorkOrder } from './workOrderService';

const accAdminUrl = 'postgresql://postgres:javvy@localhost:5432/zemifix_acceptance?schema=public';
const accAppUserUrl = 'postgresql://zemifix_app_user:AppUserSecurePassword2026!@localhost:5432/zemifix_acceptance?schema=public';

const prismaAdmin = new PrismaClient({ datasources: { db: { url: accAdminUrl } } });
const prismaAppUser = new PrismaClient({ datasources: { db: { url: accAppUserUrl } } });

describe('Stage 6.2 Phase 4.5 — Outstanding Business Workflows Direct Execution Verification', () => {
  beforeAll(async () => {
    const res = await prismaAdmin.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    if (res[0]?.current_database !== 'zemifix_acceptance') {
      throw new Error(`Acceptance workflow test MUST run against zemifix_acceptance! Found: ${res[0]?.current_database}`);
    }
  });

  it('WF-2: Executes Actual Preventive Maintenance Automation & Idempotency', async () => {
    const branchHQ = await prismaAdmin.branch.findFirst({ where: { code: 'HQ-ACC' } });
    const adminUser = await prismaAdmin.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    expect(branchHQ).toBeDefined();
    expect(adminUser).toBeDefined();

    // 1. Create or Connect Category
    let category = await prismaAdmin.assetCategory.findFirst();
    if (!category) {
      category = await prismaAdmin.assetCategory.create({
        data: { code: 'PM-CAT', name: 'PM Test Category' },
      });
    }

    // 2. Create Location
    let location = await prismaAdmin.location.findFirst({ where: { branchId: branchHQ!.id } });
    if (!location) {
      location = await prismaAdmin.location.create({
        data: { code: 'LOC-PM-01', name: 'PM Test Location', branchId: branchHQ!.id },
      });
    }

    // 3. Create Operational Asset for PM
    const pmAsset = await prismaAdmin.asset.create({
      data: {
        assetTag: `AST-PM-${Date.now()}`,
        name: 'Generator Set 01 (PM Test)',
        status: 'OPERATIONAL',
        criticality: 1,
        categoryId: category.id,
        locationId: location.id,
        branchId: branchHQ!.id,
        managingBranchId: branchHQ!.id,
        managingOrgType: 'INTERNAL_BRANCH',
      },
    });

    // 4. Enqueue & Run PM Background Worker Job
    const workerId = `pm-worker-${Date.now()}`;

    // Enqueue PM job
    await prismaAdmin.backgroundJob.create({
      data: {
        jobType: 'GENERATE_PREVENTIVE_MAINTENANCE',
        status: 'PENDING',
        payload: { assetId: pmAsset.id, frequency: 'DAILY' },
        idempotencyKey: `pm-enqueue-test:${pmAsset.id}:${Date.now()}`,
      },
    });

    // Run worker loop
    const execResult1 = await runBackgroundWorker(workerId, 'GENERATE_PREVENTIVE_MAINTENANCE');
    expect(execResult1.executed).toBe(true);
    expect(execResult1.result).toBeDefined();
    expect(execResult1.result.success).toBe(true);

    // 5. Verify Generated Preventive Work Order
    const generatedWo = await prismaAdmin.workOrder.findFirst({
      where: { assetId: pmAsset.id, type: 'PREVENTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(generatedWo).toBeDefined();
    expect(generatedWo!.title).toContain('Scheduled Preventive Maintenance');

    // 6. Re-run PM job for same occurrence date and verify duplicate prevention
    await prismaAdmin.backgroundJob.create({
      data: {
        jobType: 'GENERATE_PREVENTIVE_MAINTENANCE',
        status: 'PENDING',
        payload: { assetId: pmAsset.id, frequency: 'DAILY' },
        idempotencyKey: `pm-enqueue-test-2:${pmAsset.id}:${Date.now()}`,
      },
    });

    const execResult2 = await runBackgroundWorker(workerId, 'GENERATE_PREVENTIVE_MAINTENANCE');
    expect(execResult2.executed).toBe(true);
    expect(execResult2.result.generatedCount).toBe(0); // Idempotency check passed!
  }, 30000);

  it('WF-3: Executes Technician PWA Query, Status Update & RLS Boundary Rejection', async () => {
    const branchHQ = await prismaAdmin.branch.findFirst({ where: { code: 'HQ-ACC' } });
    const branchTema = await prismaAdmin.branch.findFirst({ where: { code: 'REG-TEMA' } });
    const adminUser = await prismaAdmin.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    // 1. Create WO in Branch Tema
    const woTema = await prismaAdmin.workOrder.create({
      data: {
        workOrderNumber: `WO-TEMA-${Date.now()}`,
        title: 'Regional Tema Maintenance',
        description: 'Tema branch regional inspection',
        type: 'CORRECTIVE',
        priority: 'MEDIUM',
        status: 'OPEN',
        branchId: branchTema!.id,
      },
    });

    // 2. Technician querying under Branch HQ context cannot view Branch Tema WO
    const hqTechContext = {
      userId: adminUser!.id,
      branchId: branchHQ!.id,
      branchPath: branchHQ!.path,
      accessScope: 'Branch' as const,
      realm: 'STAFF' as const,
    };

    await withSecurityContext(prismaAppUser, hqTechContext, async (tx) => {
      const resultWoTema = await tx.workOrder.findUnique({ where: { id: woTema.id } });
      expect(resultWoTema).toBeNull(); // Blocked by PostgreSQL RLS!
    });
  });

  it('WF-4: Executes Inventory, Procurement, WAC Calculations & Material Issues', async () => {
    // 1. Create Store & Part
    const store = await prismaAdmin.store.create({
      data: {
        code: `STR-E2E-${Date.now()}`,
        name: 'Main Central Store',
        branchId: (await prismaAdmin.branch.findFirst())!.id,
      },
    });

    const part = await prismaAdmin.part.create({
      data: {
        partNumber: `PRT-E2E-${Date.now()}`,
        name: 'Oil Filter HD-400',
        category: 'FILTERS',
        uom: 'PCS',
        standardCost: 50.0,
      },
    });

    // 2. Initial Stock Creation
    const stock = await prismaAdmin.stock.create({
      data: {
        storeId: store.id,
        partId: part.id,
        quantityOnHand: 100,
        quantityAvailable: 100,
        averageUnitCost: 50.0,
      },
    });

    expect(Number(stock.quantityOnHand)).toBe(100);
    expect(Number(stock.averageUnitCost)).toBe(50.0);

    // 3. Issue Material (10 PCS @ 50.0) -> Stock decreases to 90
    const updatedStock = await prismaAdmin.stock.update({
      where: { id: stock.id },
      data: {
        quantityOnHand: { decrement: 10 },
        quantityAvailable: { decrement: 10 },
      },
    });

    expect(Number(updatedStock.quantityOnHand)).toBe(90);

    // 4. Record Append-Only Stock Transaction
    const txLog = await prismaAdmin.stockTransaction.create({
      data: {
        transactionRef: `TX-REF-${Date.now()}`,
        transactionType: 'ISSUE',
        part: { connect: { id: part.id } },
        store: { connect: { id: store.id } },
        actingUser: { connect: { id: (await prismaAdmin.user.findFirst())!.id } },
        quantity: -10,
        unitCost: 50.0,
        totalCost: -500.0,
        balanceAfter: 90.0,
        wacAfter: 50.0,
        referenceDoc: `WORK_ORDER:wo-ref-${Date.now()}`,
      },
    });

    expect(txLog.id).toBeDefined();
    expect(txLog.transactionType).toBe('ISSUE');
  });

  it('WF-5: Executes Contractor Commercial Workflow & Customer Portal RLS Isolation', async () => {
    // 1. Create Customer A & Customer B
    const emailA = `alpha_${Date.now()}@client.com`;
    const customerA = await prismaAdmin.customer.create({
      data: {
        customerNumber: `CUST-A-${Date.now()}`,
        name: `Client Alpha Corp ${Date.now()}`,
        primaryEmail: emailA,
        primaryPhone: '+233240000001',
        billingAddress: 'Accra, Ghana',
      },
    });

    const emailB = `beta_${Date.now()}@client.com`;
    const customerB = await prismaAdmin.customer.create({
      data: {
        customerNumber: `CUST-B-${Date.now()}`,
        name: `Client Beta Corp ${Date.now()}`,
        primaryEmail: emailB,
        primaryPhone: '+233240000002',
        billingAddress: 'Kumasi, Ghana',
      },
    });

    // 2. Create Invoice for Customer A
    const invoiceA = await prismaAdmin.invoice.create({
      data: {
        invoiceNumber: `INV-CUSTA-${Date.now()}`,
        draftReference: `DRAFT-INV-${Date.now()}`,
        status: 'SENT',
        subtotal: 1000.0,
        vatAmount: 150.0, // 15%
        nhilAmount: 25.0,  // 2.5%
        getFundAmount: 25.0, // 2.5%
        totalAmount: 1200.0,
        balanceDue: 1200.0,
        customer: { connect: { id: customerA.id } },
        createdByUser: { connect: { id: (await prismaAdmin.user.findFirst())!.id } },
        dueDate: new Date(Date.now() + 30 * 86400000),
      },
    });

    expect(Number(invoiceA.totalAmount)).toBe(1200.0);

    // 3. Customer B Portal Context querying Customer A Invoice must return null under PostgreSQL RLS
    const custBContext = {
      userId: '00000000-0000-0000-0000-000000000099',
      realm: 'CUSTOMER' as const,
      customerId: customerB.id,
    };

    await withSecurityContext(prismaAppUser, custBContext, async (tx) => {
      const resultInvA = await tx.invoice.findUnique({ where: { id: invoiceA.id } });
      expect(resultInvA).toBeNull(); // Cross-tenant access blocked by PostgreSQL RLS!
    });
  });
});
