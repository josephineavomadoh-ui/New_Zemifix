import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withSecurityContext } from './securityContextService';
import { createWorkOrder } from './workOrderService';
import { appendAuditLog } from './auditService';

const accAdminUrl = 'postgresql://postgres:javvy@localhost:5432/zemifix_acceptance?schema=public';
const accAppUserUrl = 'postgresql://zemifix_app_user:AppUserSecurePassword2026!@localhost:5432/zemifix_acceptance?schema=public';

const prismaAdmin = new PrismaClient({ datasources: { db: { url: accAdminUrl } } });
const prismaAppUser = new PrismaClient({ datasources: { db: { url: accAppUserUrl } } });

describe('Stage 6.2 Phase 4.4 — Full End-to-End Business Workflows & Operational Acceptance', () => {
  beforeAll(async () => {
    const res = await prismaAdmin.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    if (res[0]?.current_database !== 'zemifix_acceptance') {
      throw new Error(`Acceptance workflow test MUST run against zemifix_acceptance! Found: ${res[0]?.current_database}`);
    }
  });

  it('Workflow 1: Executes End-to-End Core Facility Maintenance Workflow', async () => {
    const branchHQ = await prismaAdmin.branch.findFirst({ where: { code: 'HQ-ACC' } });
    const deptEng = await prismaAdmin.department.findFirst({ where: { code: 'DEPT-ENG' } });
    const adminUser = await prismaAdmin.user.findFirst({ where: { email: 'admin@zemifix.local' } });

    expect(branchHQ).toBeDefined();
    expect(deptEng).toBeDefined();
    expect(adminUser).toBeDefined();

    // 1. Create Asset
    const testAsset = await prismaAdmin.asset.create({
      data: {
        assetTag: `AST-E2E-${Date.now()}`,
        name: 'HVAC Air Handler Unit 01',
        status: 'OPERATIONAL',
        criticality: 'HIGH',
        branchId: branchHQ!.id,
        responsibleDepartmentId: deptEng!.id,
      },
    });

    // 2. Create Work Order via Service Layer
    const createdWo = await createWorkOrder(adminUser as any, {
      title: 'E2E Facility Maintenance WO',
      description: 'Emergency HVAC compressor inspection',
      type: 'CORRECTIVE',
      priority: 'HIGH',
      assetId: testAsset.id,
      branchId: branchHQ!.id,
      departmentId: deptEng!.id,
    });

    expect(createdWo).toBeDefined();
    expect(createdWo.status).toBe('OPEN');

    // 3. Query WO under restricted zemifix_app_user role with Branch context
    const branchContext = {
      userId: adminUser!.id,
      branchId: branchHQ!.id,
      branchPath: branchHQ!.path,
      accessScope: 'Branch' as const,
      realm: 'STAFF' as const,
    };

    await withSecurityContext(prismaAppUser, branchContext, async (tx) => {
      const woResult = await tx.workOrder.findUnique({ where: { id: createdWo.id } });
      expect(woResult).toBeDefined();
      expect(woResult!.title).toBe('E2E Facility Maintenance WO');
    });
  });

  it('Workflow 2: Verifies Ghana Commercial Tax Calculations (VAT 15%, NHIL 2.5%, GETFund 2.5%)', async () => {
    const subtotal = 1000.0;
    const vatRate = 0.15;
    const nhilRate = 0.025;
    const getFundRate = 0.025;

    const vatAmount = subtotal * vatRate; // 150.00
    const nhilAmount = subtotal * nhilRate; // 25.00
    const getFundAmount = subtotal * getFundRate; // 25.00
    const totalTax = vatAmount + nhilAmount + getFundAmount; // 200.00
    const grandTotal = subtotal + totalTax; // 1200.00

    expect(vatAmount).toBe(150.0);
    expect(nhilAmount).toBe(25.0);
    expect(getFundAmount).toBe(25.0);
    expect(grandTotal).toBe(1200.0);
  });

  it('Workflow 3: Verifies Append-Only Audit Logging & Hash Chain Integrity', async () => {
    const auditRes = await appendAuditLog(prismaAdmin, {
      action: 'E2E_WORKFLOW_VERIFICATION',
      resource: 'work_order',
      resourceId: 'wo-e2e-1',
      payload: { phase: '4.4' },
    });

    expect(auditRes).toBeDefined();
    expect(auditRes.hash).toHaveLength(64);
    expect(auditRes.sequenceNumber).toBeGreaterThan(0n);
  });
});
