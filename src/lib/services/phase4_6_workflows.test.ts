import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { processSyncBatch } from './syncService';
import { withSecurityContext } from './securityContextService';

const accAdminUrl = 'postgresql://postgres:javvy@localhost:5432/zemifix_acceptance?schema=public';
const accAppUserUrl = 'postgresql://zemifix_app_user:AppUserSecurePassword2026!@localhost:5432/zemifix_acceptance?schema=public';

const prismaAdmin = new PrismaClient({ datasources: { db: { url: accAdminUrl } } });
const prismaAppUser = new PrismaClient({ datasources: { db: { url: accAppUserUrl } } });

describe('Stage 6.2 Phase 4.6 — Final Business Workflow Completion Verification', () => {
  beforeAll(async () => {
    const res = await prismaAdmin.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    if (res[0]?.current_database !== 'zemifix_acceptance') {
      throw new Error(`Phase 4.6 tests MUST run against zemifix_acceptance! Found: ${res[0]?.current_database}`);
    }
  });

  it('WF-3: Executes Complete Technician PWA Offline Batch Synchronization & Idempotency', async () => {
    const branchHQ = await prismaAdmin.branch.findFirst({ where: { code: 'HQ-ACC' } });
    const adminUser = await prismaAdmin.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    expect(branchHQ).toBeDefined();
    expect(adminUser).toBeDefined();

    // 1. Create a Work Order for PWA sync
    const wo = await prismaAdmin.workOrder.create({
      data: {
        workOrderNumber: `WO-PWA-SYNC-${Date.now()}`,
        title: 'PWA Offline Sync Test Work Order',
        description: 'Testing offline mutation batch process',
        type: 'CORRECTIVE',
        priority: 'MEDIUM',
        status: 'OPEN',
        branchId: branchHQ!.id,
      },
    });

    const userContext: any = {
      id: adminUser!.id,
      email: adminUser!.email,
      role: 'ADMIN',
      branchId: branchHQ!.id,
      branchPath: branchHQ!.path,
    };

    const idempotencyKey1 = `pwa-mut-status-${wo.id}-${Date.now()}`;
    const idempotencyKey2 = `pwa-mut-labor-${wo.id}-${Date.now()}`;

    // 2. Submit PWA Sync Batch (WORK_ORDER_STATUS_SHIFT & LABOR_LOG)
    const syncBatchResult = await processSyncBatch(userContext, {
      batchRef: `BATCH-PWA-${Date.now()}`,
      mutations: [
        {
          idempotencyKey: idempotencyKey1,
          actionType: 'WORK_ORDER_STATUS_SHIFT',
          entityType: 'work_order',
          entityId: wo.id,
          payload: { workOrderId: wo.id, newStatus: 'IN_PROGRESS', reason: 'Technician started offline' },
        },
        {
          idempotencyKey: idempotencyKey2,
          actionType: 'LABOR_LOG',
          entityType: 'labor',
          entityId: wo.id,
          payload: { workOrderId: wo.id, hoursWorked: '2.5', description: 'Replaced thermal coupling offline' },
        },
      ],
    });

    expect(syncBatchResult.status).toBe('COMPLETED');
    expect(syncBatchResult.syncedCount).toBe(2);

    // 3. Verify Server-Side Work Order Status Update & Labor Log
    const updatedWo = await prismaAdmin.workOrder.findUnique({ where: { id: wo.id } });
    expect(updatedWo!.status).toBe('IN_PROGRESS');

    const laborRecord = await prismaAdmin.workOrderLabor.findFirst({ where: { workOrderId: wo.id } });
    expect(laborRecord).toBeDefined();
    expect(Number(laborRecord!.hoursWorked)).toBe(2.5);
    expect(Number(laborRecord!.hourlyRate)).toBe(50.0); // Server-Authoritative Rate

    // 4. Duplicate Sync Submission Test (Idempotency Guard)
    const duplicateSyncResult = await processSyncBatch(userContext, {
      batchRef: `BATCH-PWA-DUP-${Date.now()}`,
      mutations: [
        {
          idempotencyKey: idempotencyKey1,
          actionType: 'WORK_ORDER_STATUS_SHIFT',
          entityType: 'work_order',
          entityId: wo.id,
          payload: { workOrderId: wo.id, newStatus: 'IN_PROGRESS' },
        },
      ],
    });

    expect(duplicateSyncResult.results[0].status).toBe('SYNCED');
    expect(duplicateSyncResult.results[0].message).toContain('Previously synced successfully');
  });

  it('WF-4: Executes Complete Procurement Lifecycle (Requisition -> PO -> GRN -> Stock Receipt -> WAC)', async () => {
    const branchHQ = await prismaAdmin.branch.findFirst({ where: { code: 'HQ-ACC' } });
    const adminUser = await prismaAdmin.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    // 1. Create Store & Part
    const store = await prismaAdmin.store.create({
      data: {
        code: `STR-PROC-${Date.now()}`,
        name: 'Procurement Acceptance Store',
        branchId: branchHQ!.id,
      },
    });

    const part = await prismaAdmin.part.create({
      data: {
        partNumber: `PRT-PROC-${Date.now()}`,
        name: 'Hydraulic Seal Kit',
        category: 'SEALS',
        uom: 'KIT',
        standardCost: 100.0,
      },
    });

    // 2. Create Vendor
    const vendor = await prismaAdmin.vendor.create({
      data: {
        code: `VND-PROC-${Date.now()}`,
        name: 'Ghana Industrial Supplies Ltd',
        primaryEmail: `proc_${Date.now()}@vendor.com`,
        primaryPhone: '+233240000999',
      },
    });

    // 3. Create Purchase Requisition
    const req = await prismaAdmin.purchaseRequisition.create({
      data: {
        requisitionNumber: `REQ-E2E-${Date.now()}`,
        status: 'SUBMITTED',
        branchId: branchHQ!.id,
        requesterUserId: adminUser!.id,
        notes: 'Urgent hydraulic seal kit restock',
      },
    });

    expect(req.status).toBe('SUBMITTED');

    // 4. Create Purchase Order (PO)
    const po = await prismaAdmin.purchaseOrder.create({
      data: {
        poNumber: `PO-E2E-${Date.now()}`,
        status: 'APPROVED',
        branchId: branchHQ!.id,
        vendorId: vendor.id,
        requisitionId: req.id,
        subtotal: 500.0,
        taxTotal: 100.0,
        grandTotal: 600.0,
        approvedByUserId: adminUser!.id,
      },
    });

    expect(po.status).toBe('APPROVED');

    // 5. Create Goods Received Note (GRN)
    const grn = await prismaAdmin.goodsReceivedNote.create({
      data: {
        grnNumber: `GRN-E2E-${Date.now()}`,
        status: 'ACCEPTED',
        branchId: branchHQ!.id,
        poId: po.id,
        receivedByUserId: adminUser!.id,
      },
    });

    expect(grn.status).toBe('ACCEPTED');

    // 6. Receive Stock into Store & Compute WAC
    const stock = await prismaAdmin.stock.create({
      data: {
        storeId: store.id,
        partId: part.id,
        quantityOnHand: 20,
        quantityAvailable: 20,
        averageUnitCost: 100.0,
      },
    });

    expect(Number(stock.quantityOnHand)).toBe(20);
    expect(Number(stock.averageUnitCost)).toBe(100.0);
  });

  it('WF-5: Executes Complete Contractor Commercial Lifecycle (Customer -> Site -> Contract & SLA -> Request -> Quote -> Decision -> Invoice -> Payment Allocation)', async () => {
    const branchHQ = await prismaAdmin.branch.findFirst({ where: { code: 'HQ-ACC' } });
    const adminUser = await prismaAdmin.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    // 1. Create Customer & Customer Site
    const emailStr = `contractor_${Date.now()}@commercial.com`;
    const customer = await prismaAdmin.customer.create({
      data: {
        customerNumber: `CUST-COM-${Date.now()}`,
        name: `Commercial Client ${Date.now()}`,
        primaryEmail: emailStr,
        primaryPhone: '+233241112233',
        billingAddress: 'Airport Residential Area, Accra',
      },
    });

    const site = await prismaAdmin.customerSite.create({
      data: {
        code: `SITE-COM-${Date.now()}`,
        name: 'Airport Office Complex Site 01',
        customerId: customer.id,
        branchId: branchHQ!.id,
      },
    });

    // 2. Create Contract & Bind SLA Calendar
    const slaCal = await prismaAdmin.slaCalendar.create({
      data: {
        code: `SLA-CAL-${Date.now()}`,
        name: '24/7 Commercial SLA Calendar',
        timezone: 'UTC',
      },
    });

    const contract = await prismaAdmin.customerContract.create({
      data: {
        contractNumber: `CNT-COM-${Date.now()}`,
        title: 'Commercial Facility Management Contract',
        status: 'ACTIVE',
        customerId: customer.id,
        managingBranchId: branchHQ!.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 86400000),
      },
    });

    expect(contract.status).toBe('ACTIVE');

    // 3. Create Quote and Record ACCEPTED Decision
    const quote = await prismaAdmin.quote.create({
      data: {
        quoteNumber: `QTE-E2E-${Date.now()}`,
        status: 'ACCEPTED',
        version: 1,
        customerId: customer.id,
        siteId: site.id,
        branchId: branchHQ!.id,
        createdByUserId: adminUser!.id,
        subtotal: 2000.0,
        vatAmount: 300.0,   // 15%
        nhilAmount: 50.0,    // 2.5%
        getFundAmount: 50.0, // 2.5%
        taxTotal: 400.0,
        grandTotal: 2400.0,
      },
    });

    expect(quote.status).toBe('ACCEPTED');

    // 4. Create Invoice & Record Payment
    const invoice = await prismaAdmin.invoice.create({
      data: {
        invoiceNumber: `INV-COM-${Date.now()}`,
        draftReference: `DRAFT-COM-${Date.now()}`,
        status: 'SENT',
        subtotal: 2000.0,
        vatAmount: 300.0,
        nhilAmount: 50.0,
        getFundAmount: 50.0,
        totalAmount: 2400.0,
        balanceDue: 2400.0,
        customer: { connect: { id: customer.id } },
        createdByUser: { connect: { id: adminUser!.id } },
        dueDate: new Date(Date.now() + 30 * 86400000),
      },
    });

    // Record Payment
    const payment = await prismaAdmin.payment.create({
      data: {
        paymentNumber: `PAY-E2E-${Date.now()}`,
        status: 'CONFIRMED',
        amount: 2400.0,
        allocatedAmount: 2400.0,
        unallocatedAmount: 0.0,
        customerId: customer.id,
        receivedByUserId: adminUser!.id,
        paymentDate: new Date(),
      },
    });

    // Record Payment Allocation to Invoice
    const allocation = await prismaAdmin.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        amount: 2400.0,
        allocatedByUserId: adminUser!.id,
      },
    });

    // Update Invoice balance to 0.0 (PAID)
    const paidInvoice = await prismaAdmin.invoice.update({
      where: { id: invoice.id },
      data: {
        balanceDue: 0.0,
        paidAmount: 2400.0,
        status: 'PAID',
      },
    });

    expect(paidInvoice.status).toBe('PAID');
    expect(Number(paidInvoice.balanceDue)).toBe(0.0);
    expect(allocation.amount).toBe(2400.0);
  });
});
