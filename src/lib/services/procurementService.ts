import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { AuthenticatedUser } from '../auth';
import { generateUuidV7 } from '../uuid';
import { appendAuditLog } from './auditService';
import { notifyStaff } from './notificationService';
import { postStockTransaction } from './inventoryService';
import { calculateTaxBreakdown } from './financialTaxUtil';
import { withSecurityContext, SecurityAccessScope } from './securityContextService';

function withProcurementContext<T>(
  user: AuthenticatedUser,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  existingTx?: Prisma.TransactionClient
): Promise<T> {
  if (!user?.id) {
    throw new Error('SECURITY_CONTEXT_INVALID: A valid staff user context is required.');
  }

  return withSecurityContext(
    {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch?.path ?? '',
      departmentId: user.departmentId,
      accessScope: (user.accessScope as SecurityAccessScope) ?? 'Own',
      realm: 'STAFF',
    },
    callback,
    existingTx
  );
}

/**
 * 1. PURCHASE REQUISITIONS & APPROVALS
 */
export async function createPurchaseRequisition(
  user: AuthenticatedUser,
  params: {
    justification: string;
    requiredDate?: Date;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'EMERGENCY';
    items: Array<{
      partId?: string | null;
      description: string;
      quantity: number;
      estimatedUnitPrice?: number;
    }>;
  },
  existingTx?: Prisma.TransactionClient
) {
  if (params.items.length === 0) {
    throw new Error('EMPTY_REQUISITION: Requisition must contain at least one line item.');
  }

  return await withProcurementContext(user, async (tx) => {
    const reqUuid = generateUuidV7();
    const ts = Date.now();
    const requisitionNumber = `PR-${new Date().getFullYear()}-${ts.toString().slice(-6)}`;

    let totalEst = new Prisma.Decimal(0);
    const itemData = params.items.map((i) => {
      const qty = new Prisma.Decimal(i.quantity);
      const price = new Prisma.Decimal(i.estimatedUnitPrice ?? 0);
      const lineTotal = qty.mul(price);
      totalEst = totalEst.add(lineTotal);

      return {
        id: generateUuidV7(),
        partId: i.partId ?? null,
        description: i.description,
        quantity: qty,
        estimatedUnitPrice: price,
        estimatedTotal: lineTotal,
      };
    });

    const req = await tx.purchaseRequisition.create({
      data: {
        id: reqUuid,
        requisitionNumber,
        branchId: user.branchId,
        departmentId: user.departmentId ?? null,
        requesterUserId: user.id,
        requestDate: new Date(),
        requiredDate: params.requiredDate ?? null,
        priority: params.priority ?? 'MEDIUM',
        justification: params.justification,
        estimatedTotal: totalEst,
        status: 'SUBMITTED',
        items: {
          create: itemData,
        },
      },
    });

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: 'CREATED_PURCHASE_REQUISITION',
      resource: 'purchase_requisition',
      resourceId: req.id,
      payload: { requisitionNumber, estimatedTotal: totalEst.toString(), priority: params.priority },
    });

    return req;
  }, existingTx);
}

export async function getPurchaseRequisitions(
  user: AuthenticatedUser,
  filters?: { search?: string; status?: string; branchId?: string },
  existingTx?: Prisma.TransactionClient
) {
  return await withProcurementContext(user, async (tx) => {
    const where: any = {
      deletedAt: null,
      branchId: user.accessScope === 'Company' ? (filters?.branchId ?? undefined) : user.branchId,
    };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search) {
      where.OR = [
        { requisitionNumber: { contains: filters.search, mode: 'insensitive' } },
        { justification: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return tx.purchaseRequisition.findMany({
      where,
      include: {
        requesterUser: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        items: { include: { part: { select: { id: true, partNumber: true, name: true, uom: true } } } },
        approvalRequest: {
          include: {
            steps: { include: { actions: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }, existingTx);
}

export async function getRequisitionById(
  user: AuthenticatedUser,
  id: string,
  existingTx?: Prisma.TransactionClient
) {
  return await withProcurementContext(user, async (tx) => {
    const req = await tx.purchaseRequisition.findUnique({
      where: { id },
      include: {
        requesterUser: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        items: { include: { part: { select: { id: true, partNumber: true, name: true, uom: true, standardCost: true } } } },
        approvalRequest: {
          include: {
            steps: { include: { actions: true } },
          },
        },
        rfqs: { select: { id: true, rfqNumber: true, status: true } },
        purchaseOrders: { select: { id: true, poNumber: true, status: true, totalAmount: true } },
      },
    });

    if (!req || req.deletedAt !== null) {
      throw new Error('REQUISITION_NOT_FOUND: Purchase requisition does not exist.');
    }

    if (user.accessScope !== 'Company' && req.branchId !== user.branchId) {
      throw new Error('UNAUTHORIZED_BRANCH_SCOPE: Requisition belongs to another branch.');
    }

    return req;
  }, existingTx);
}

export async function updateRequisitionStatus(
  user: AuthenticatedUser,
  id: string,
  action: 'APPROVE' | 'REJECT' | 'CANCEL' | 'RETURN_FOR_REVISION',
  notes?: string,
  existingTx?: Prisma.TransactionClient
) {
  return await withProcurementContext(user, async (tx) => {
    const req = await tx.purchaseRequisition.findUnique({ where: { id } });
    if (!req) throw new Error('REQUISITION_NOT_FOUND: Requisition does not exist.');

    // Maker cannot self-approve
    if (action === 'APPROVE' && req.requesterUserId === user.id) {
      throw new Error('MAKER_CHECKER_VIOLATION: Requester cannot approve their own requisition.');
    }

    let newStatus = req.status;
    if (action === 'APPROVE') newStatus = 'APPROVED';
    else if (action === 'REJECT') newStatus = 'REJECTED';
    else if (action === 'CANCEL') newStatus = 'CANCELLED';
    else if (action === 'RETURN_FOR_REVISION') newStatus = 'DRAFT';

    const updated = await tx.purchaseRequisition.update({
      where: { id },
      data: { status: newStatus },
    });

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: `REQUISITION_${action}`,
      resource: 'purchase_requisition',
      resourceId: id,
      payload: { previousStatus: req.status, newStatus, notes },
    });

    return updated;
  }, existingTx);
}

/**
 * 2. REQUEST FOR QUOTATION (RFQ) & COMPARISON
 */
export async function createRfq(
  user: AuthenticatedUser,
  params: {
    title: string;
    requisitionId?: string | null;
    vendorIds: string[];
    closingDate?: Date;
    notes?: string;
  },
  existingTx?: Prisma.TransactionClient
) {
  if (params.vendorIds.length === 0) {
    throw new Error('NO_VENDORS: RFQ must be sent to at least one vendor.');
  }

  return await withProcurementContext(user, async (tx) => {
    const rfqUuid = generateUuidV7();
    const ts = Date.now();
    const rfqNumber = `RFQ-${new Date().getFullYear()}-${ts.toString().slice(-6)}`;

    const rfq = await tx.rfq.create({
      data: {
        id: rfqUuid,
        rfqNumber,
        requisitionId: params.requisitionId ?? null,
        title: params.title,
        status: 'SENT',
        closingDate: params.closingDate ?? null,
        notes: params.notes ?? null,
        createdByUserId: user.id,
        rfqVendors: {
          create: params.vendorIds.map((vId) => ({
            id: generateUuidV7(),
            vendorId: vId,
          })),
        },
      },
    });

    if (params.requisitionId) {
      await tx.purchaseRequisition.update({
        where: { id: params.requisitionId },
        data: { status: 'CONVERTED_TO_PO' },
      });
    }

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: 'CREATED_RFQ',
      resource: 'rfq',
      resourceId: rfq.id,
      payload: { rfqNumber, vendorCount: params.vendorIds.length },
    });

    return rfq;
  }, existingTx);
}

export async function getRfqs(user: AuthenticatedUser, existingTx?: Prisma.TransactionClient) {
  return await withProcurementContext(user, async (tx) => {
    return tx.rfq.findMany({
      include: {
        requisition: { select: { id: true, requisitionNumber: true, justification: true, items: true } },
        createdByUser: { select: { id: true, name: true, email: true } },
        rfqVendors: {
          include: {
            vendor: { select: { id: true, registeredName: true, code: true, email: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }, existingTx);
}

export async function getRfqById(user: AuthenticatedUser, id: string, existingTx?: Prisma.TransactionClient) {
  return await withProcurementContext(user, async (tx) => {
    const rfq = await tx.rfq.findUnique({
      where: { id },
      include: {
        requisition: {
          include: {
            items: { include: { part: { select: { partNumber: true, name: true, uom: true } } } },
          },
        },
        createdByUser: { select: { id: true, name: true, email: true } },
        rfqVendors: {
          include: {
            vendor: { select: { id: true, registeredName: true, code: true, email: true, phone: true, rating: true } },
          },
        },
      },
    });

    if (!rfq) throw new Error('RFQ_NOT_FOUND: RFQ does not exist.');
    return rfq;
  }, existingTx);
}

export async function addVendorQuotation(
  user: AuthenticatedUser,
  params: {
    rfqId: string;
    vendorId: string;
    quotedUnitPrice: number;
    quotedTotalPrice: number;
    deliveryDays?: number;
    paymentTerms?: string;
    validityDate?: Date;
  },
  existingTx?: Prisma.TransactionClient
) {
  return await withProcurementContext(user, async (tx) => {
    const existing = await tx.rfqVendor.findUnique({
      where: { rfqId_vendorId: { rfqId: params.rfqId, vendorId: params.vendorId } },
    });

    if (!existing) {
      throw new Error('VENDOR_NOT_IN_RFQ: Selected vendor is not part of this RFQ.');
    }

    const updated = await tx.rfqVendor.update({
      where: { id: existing.id },
      data: {
        quotedUnitPrice: new Prisma.Decimal(params.quotedUnitPrice),
        quotedTotalPrice: new Prisma.Decimal(params.quotedTotalPrice),
        deliveryDays: params.deliveryDays ?? null,
        paymentTerms: params.paymentTerms ?? null,
        validityDate: params.validityDate ?? null,
        quotedAt: new Date(),
      },
    });

    await tx.rfq.update({
      where: { id: params.rfqId },
      data: { status: 'CLOSED' },
    });

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: 'RECORDED_VENDOR_QUOTATION',
      resource: 'rfq_vendor',
      resourceId: updated.id,
      payload: { rfqId: params.rfqId, vendorId: params.vendorId, quotedTotalPrice: params.quotedTotalPrice },
    });

    return updated;
  }, existingTx);
}

export async function evaluateVendorQuotations(
  user: AuthenticatedUser,
  params: {
    rfqId: string;
    selectedVendorId: string;
    selectionJustification: string;
  },
  existingTx?: Prisma.TransactionClient
) {
  return await withProcurementContext(user, async (tx) => {
    const rfqVendors = await tx.rfqVendor.findMany({
      where: { rfqId: params.rfqId },
    });

    for (const rv of rfqVendors) {
      const isSelected = rv.vendorId === params.selectedVendorId;
      await tx.rfqVendor.update({
        where: { id: rv.id },
        data: {
          isSelected,
          selectionJustification: isSelected ? params.selectionJustification : null,
        },
      });
    }

    const updatedRfq = await tx.rfq.update({
      where: { id: params.rfqId },
      data: { status: 'EVALUATED' },
    });

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: 'EVALUATED_RFQ_QUOTATIONS',
      resource: 'rfq',
      resourceId: params.rfqId,
      payload: { selectedVendorId: params.selectedVendorId, justification: params.selectionJustification },
    });

    return updatedRfq;
  }, existingTx);
}

/**
 * 3. PURCHASE ORDERS (WITH CENTRALIZED TAX ENGINE)
 */
export async function createPurchaseOrder(
  user: AuthenticatedUser,
  params: {
    vendorId: string;
    requisitionId?: string | null;
    expectedDeliveryDate?: Date;
    deliveryAddress: string;
    paymentTermsDays?: number;
    taxScheme?: string;
    items: Array<{
      partId?: string | null;
      description: string;
      quantityOrdered: number;
      unitPrice: number;
      discountAmount?: number;
    }>;
  },
  existingTx?: Prisma.TransactionClient
) {
  if (params.items.length === 0) {
    throw new Error('EMPTY_PO: Purchase order must contain at least one line item.');
  }

  return await withProcurementContext(user, async (tx) => {
    const poUuid = generateUuidV7();
    const ts = Date.now();
    const poNumber = `PO-${new Date().getFullYear()}-${ts.toString().slice(-6)}`;

    let subtotal = new Prisma.Decimal(0);
    const itemData = params.items.map((i) => {
      const qty = new Prisma.Decimal(i.quantityOrdered);
      const price = new Prisma.Decimal(i.unitPrice);
      const disc = new Prisma.Decimal(i.discountAmount ?? 0);
      const lineTotal = qty.mul(price).sub(disc);
      subtotal = subtotal.add(lineTotal);

      return {
        id: generateUuidV7(),
        partId: i.partId ?? null,
        description: i.description,
        quantityOrdered: qty,
        quantityReceived: new Prisma.Decimal(0),
        unitPrice: price,
        discountAmount: disc,
        lineTotal,
      };
    });

    const tax = calculateTaxBreakdown(subtotal, params.taxScheme ?? 'GHANA_STATUTORY_2026');

    const po = await tx.purchaseOrder.create({
      data: {
        id: poUuid,
        poNumber,
        vendorId: params.vendorId,
        requisitionId: params.requisitionId ?? null,
        branchId: user.branchId,
        departmentId: user.departmentId ?? null,
        orderDate: new Date(),
        expectedDeliveryDate: params.expectedDeliveryDate ?? null,
        subtotal: tax.subtotal,
        vatAmount: tax.vatAmount,
        nhilAmount: tax.nhilAmount,
        getFundAmount: tax.getFundAmount,
        totalAmount: tax.totalAmount,
        paymentTermsDays: params.paymentTermsDays ?? 30,
        deliveryAddress: params.deliveryAddress,
        status: 'ISSUED',
        issuedAt: new Date(),
        approvedByUserId: user.id,
        items: {
          create: itemData,
        },
      },
      include: {
        items: true,
      },
    });

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: 'CREATED_PURCHASE_ORDER',
      resource: 'purchase_order',
      resourceId: po.id,
      payload: { poNumber, totalAmount: tax.totalAmount.toString(), vendorId: params.vendorId },
    });

    return po;
  }, existingTx);
}

export async function getPurchaseOrders(
  user: AuthenticatedUser,
  filters?: { search?: string; status?: string; vendorId?: string },
  existingTx?: Prisma.TransactionClient
) {
  return await withProcurementContext(user, async (tx) => {
    const where: any = {
      deletedAt: null,
      branchId: user.accessScope === 'Company' ? undefined : user.branchId,
    };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.vendorId) {
      where.vendorId = filters.vendorId;
    }

    if (filters?.search) {
      where.OR = [
        { poNumber: { contains: filters.search, mode: 'insensitive' } },
        { deliveryAddress: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return tx.purchaseOrder.findMany({
      where,
      include: {
        vendor: { select: { id: true, registeredName: true, code: true, email: true, phone: true } },
        branch: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        items: { include: { part: { select: { id: true, partNumber: true, name: true, uom: true } } } },
        goodsReceivedNotes: { select: { id: true, grnNumber: true, deliveryDate: true, status: true } },
        approvedByUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }, existingTx);
}

export async function getPurchaseOrderById(user: AuthenticatedUser, id: string, existingTx?: Prisma.TransactionClient) {
  return await withProcurementContext(user, async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id },
      include: {
        vendor: { select: { id: true, registeredName: true, code: true, email: true, phone: true, address: true, taxId: true } },
        branch: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        items: { include: { part: { select: { id: true, partNumber: true, name: true, uom: true } } } },
        goodsReceivedNotes: {
          include: {
            items: { include: { part: { select: { partNumber: true, name: true } } } },
            receivedByUser: { select: { name: true, email: true } },
          },
        },
        approvedByUser: { select: { id: true, name: true, email: true } },
        requisition: { select: { id: true, requisitionNumber: true, justification: true } },
      },
    });

    if (!po || po.deletedAt !== null) {
      throw new Error('PO_NOT_FOUND: Purchase order does not exist.');
    }

    if (user.accessScope !== 'Company' && po.branchId !== user.branchId) {
      throw new Error('UNAUTHORIZED_BRANCH_SCOPE: Purchase order belongs to another branch.');
    }

    return po;
  }, existingTx);
}

export async function updatePurchaseOrderStatus(
  user: AuthenticatedUser,
  id: string,
  action: 'APPROVE' | 'REJECT' | 'ISSUE' | 'CANCEL',
  notes?: string,
  existingTx?: Prisma.TransactionClient
) {
  return await withProcurementContext(user, async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new Error('PO_NOT_FOUND: Purchase order does not exist.');

    // Maker cannot approve their own PO
    if (action === 'APPROVE' && po.approvedByUserId === user.id) {
      throw new Error('MAKER_CHECKER_VIOLATION: Maker cannot approve their own purchase order.');
    }

    let newStatus = po.status;
    let approvedByUserId = po.approvedByUserId;
    let issuedAt = po.issuedAt;

    if (action === 'APPROVE') {
      newStatus = 'APPROVED';
      approvedByUserId = user.id;
    } else if (action === 'REJECT') {
      newStatus = 'CANCELLED';
    } else if (action === 'ISSUE') {
      newStatus = 'ISSUED';
      issuedAt = new Date();
    } else if (action === 'CANCEL') {
      newStatus = 'CANCELLED';
    }

    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: newStatus,
        approvedByUserId,
        issuedAt,
      },
    });

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: `PURCHASE_ORDER_${action}`,
      resource: 'purchase_order',
      resourceId: id,
      payload: { previousStatus: po.status, newStatus, notes },
    });

    return updated;
  }, existingTx);
}

/**
 * 4. GOODS RECEIVED NOTES (GRN) — DUAL-CONTROL WORKFLOW & INVENTORY INTEGRATION
 */
export async function createGoodsReceivedNote(
  user: AuthenticatedUser,
  params: {
    poId: string;
    storeId: string;
    deliveryDate?: Date;
    invoiceReference?: string;
    notes?: string;
    items: Array<{
      poItemId: string;
      partId?: string | null;
      quantityReceived: number;
      quantityAccepted: number;
      quantityRejected?: number;
      unitCost: number;
    }>;
  },
  existingTx?: Prisma.TransactionClient
) {
  if (params.items.length === 0) {
    throw new Error('EMPTY_GRN: Goods Received Note must contain at least one item.');
  }

  return await withProcurementContext(user, async (tx) => {
    const [po] = await tx.$queryRaw<Array<{
      id: string;
      vendorId: string;
      poNumber: string;
      status: string;
    }>>`
      SELECT id, "vendorId", "poNumber", status FROM "purchase_orders" WHERE id = ${params.poId}::uuid FOR UPDATE
    `;

    if (!po) throw new Error('PO_NOT_FOUND: Purchase order does not exist.');
    if (po.status === 'CLOSED' || po.status === 'CANCELLED') {
      throw new Error('FINALIZED_PO: Cannot receive goods against a closed or cancelled purchase order.');
    }

    const grnUuid = generateUuidV7();
    const ts = Date.now();
    const grnNumber = `GRN-${new Date().getFullYear()}-${ts.toString().slice(-6)}`;

    const grn = await tx.goodsReceivedNote.create({
      data: {
        id: grnUuid,
        grnNumber,
        poId: po.id,
        vendorId: po.vendorId,
        storeId: params.storeId,
        deliveryDate: params.deliveryDate ?? new Date(),
        invoiceReference: params.invoiceReference ?? null,
        notes: params.notes ?? null,
        status: 'RECEIVED',
        receivedByUserId: user.id,
      },
    });

    for (const item of params.items) {
      if (item.quantityAccepted < 0) {
        throw new Error('INVALID_ACCEPTED_QUANTITY: Accepted quantity cannot be negative.');
      }

      await tx.goodsReceivedNoteItem.create({
        data: {
          id: generateUuidV7(),
          grnId: grn.id,
          poItemId: item.poItemId,
          partId: item.partId ?? null,
          quantityReceived: new Prisma.Decimal(item.quantityReceived),
          quantityAccepted: new Prisma.Decimal(item.quantityAccepted),
          quantityRejected: new Prisma.Decimal(item.quantityRejected ?? 0),
          unitCost: new Prisma.Decimal(item.unitCost),
        },
      });
    }

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: 'SUBMITTED_GOODS_RECEIVED_NOTE',
      resource: 'goods_received_note',
      resourceId: grn.id,
      payload: { grnNumber, poNumber: po.poNumber, status: 'RECEIVED' },
    });

    return grn;
  }, existingTx);
}

export async function approveGoodsReceivedNote(
  checkerUser: AuthenticatedUser,
  grnId: string,
  bypassSelfCheck: boolean = false,
  existingTx?: Prisma.TransactionClient
) {
  return await withProcurementContext(checkerUser, async (tx) => {
    const grn = await tx.goodsReceivedNote.findUnique({
      where: { id: grnId },
      include: {
        items: true,
        po: true,
      },
    });

    if (!grn) throw new Error('GRN_NOT_FOUND: Goods Received Note does not exist.');

    // Dual control check: receiving storekeeper cannot approve their own GRN
    if (!bypassSelfCheck && grn.receivedByUserId === checkerUser.id) {
      throw new Error('DUAL_CONTROL_VIOLATION: Receiving storekeeper cannot approve their own Goods Received Note.');
    }

    if (grn.status === 'ACCEPTED') {
      throw new Error('ALREADY_ACCEPTED: Goods Received Note is already approved and posted.');
    }

    let allItemsReceived = true;

    for (const item of grn.items) {
      const [poItem] = await tx.$queryRaw<Array<{
        id: string;
        quantityOrdered: string;
        quantityReceived: string;
        partId: string | null;
      }>>`
        SELECT id, "quantityOrdered"::text as "quantityOrdered", "quantityReceived"::text as "quantityReceived", "partId"
          FROM "purchase_order_items"
         WHERE id = ${item.poItemId}::uuid
        FOR UPDATE
      `;

      if (poItem) {
        const currReceived = new Prisma.Decimal(poItem.quantityReceived);
        const newReceived = currReceived.add(item.quantityAccepted);
        const ordered = new Prisma.Decimal(poItem.quantityOrdered);

        if (newReceived.lt(ordered)) {
          allItemsReceived = false;
        }

        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { quantityReceived: newReceived },
        });
      }

      const targetPartId = item.partId ?? poItem?.partId;
      if (item.quantityAccepted.gt(0) && targetPartId) {
        await postStockTransaction(tx, {
          transactionType: 'RECEIPT',
          storeId: grn.storeId,
          partId: targetPartId,
          quantity: Number(item.quantityAccepted),
          unitCost: Number(item.unitCost),
          referenceDoc: grn.grnNumber,
          actingUserId: checkerUser.id,
        });
      }
    }

    const newPoStatus = allItemsReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    await tx.purchaseOrder.update({
      where: { id: grn.poId },
      data: { status: newPoStatus },
    });

    const updatedGrn = await tx.goodsReceivedNote.update({
      where: { id: grnId },
      data: { status: 'ACCEPTED' },
    });

    await appendAuditLog(tx, {
      actorUserId: checkerUser.id,
      action: 'APPROVED_GOODS_RECEIVED_NOTE',
      resource: 'goods_received_note',
      resourceId: grn.id,
      payload: { grnNumber: grn.grnNumber, poNumber: grn.po.poNumber, status: 'ACCEPTED' },
    });

    return updatedGrn;
  }, existingTx);
}

export async function getGoodsReceivedNotes(user: AuthenticatedUser, existingTx?: Prisma.TransactionClient) {
  return await withProcurementContext(user, async (tx) => {
    return tx.goodsReceivedNote.findMany({
      include: {
        po: { select: { id: true, poNumber: true, totalAmount: true } },
        vendor: { select: { id: true, registeredName: true, code: true } },
        store: { select: { id: true, name: true, code: true } },
        receivedByUser: { select: { id: true, name: true, email: true } },
        items: { include: { part: { select: { partNumber: true, name: true, uom: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }, existingTx);
}

export async function getGoodsReceivedNoteById(user: AuthenticatedUser, id: string, existingTx?: Prisma.TransactionClient) {
  return await withProcurementContext(user, async (tx) => {
    const grn = await tx.goodsReceivedNote.findUnique({
      where: { id },
      include: {
        po: { select: { id: true, poNumber: true, orderDate: true, subtotal: true, totalAmount: true } },
        vendor: { select: { id: true, registeredName: true, code: true, email: true, phone: true } },
        store: { select: { id: true, name: true, code: true } },
        receivedByUser: { select: { id: true, name: true, email: true } },
        items: { include: { part: { select: { id: true, partNumber: true, name: true, uom: true } } } },
        supplierReturns: { select: { id: true, returnNumber: true, reason: true, status: true } },
      },
    });

    if (!grn) throw new Error('GRN_NOT_FOUND: Goods Received Note does not exist.');
    return grn;
  }, existingTx);
}

/**
 * 5. SUPPLIER RETURNS
 */
export async function createSupplierReturn(
  user: AuthenticatedUser,
  params: {
    grnId: string;
    reason: string;
    items: Array<{
      partId: string;
      quantityReturned: number;
      unitCost: number;
    }>;
  },
  autoApprove: boolean = true,
  existingTx?: Prisma.TransactionClient
) {
  return await withProcurementContext(user, async (tx) => {
    const grn = await tx.goodsReceivedNote.findUnique({
      where: { id: params.grnId },
      include: { po: true, items: true },
    });

    if (!grn) throw new Error('GRN_NOT_FOUND: Goods Received Note does not exist.');

    for (const item of params.items) {
      const grnItem = grn.items.find((gi: any) => gi.partId === item.partId);
      if (grnItem && new Prisma.Decimal(item.quantityReturned).gt(grnItem.quantityAccepted)) {
        throw new Error(`EXCESS_RETURN_QUANTITY: Returned quantity (${item.quantityReturned}) exceeds accepted quantity (${grnItem.quantityAccepted}).`);
      }
    }

    const returnUuid = generateUuidV7();
    const ts = Date.now();
    const returnNumber = `RET-SUP-${new Date().getFullYear()}-${ts.toString().slice(-6)}`;

    const supplierReturn = await tx.supplierReturn.create({
      data: {
        id: returnUuid,
        returnNumber,
        grnId: grn.id,
        vendorId: grn.vendorId,
        storeId: grn.storeId,
        returnDate: new Date(),
        reason: params.reason,
        status: autoApprove ? 'COMPLETED' : 'SUBMITTED',
        createdByUserId: user.id,
      },
    });

    for (const item of params.items) {
      await tx.supplierReturnItem.create({
        data: {
          id: generateUuidV7(),
          returnId: supplierReturn.id,
          partId: item.partId,
          quantityReturned: new Prisma.Decimal(item.quantityReturned),
          unitCost: new Prisma.Decimal(item.unitCost),
        },
      });

      if (autoApprove) {
        await postStockTransaction(tx, {
          transactionType: 'RETURN_OUT',
          storeId: grn.storeId,
          partId: item.partId,
          quantity: item.quantityReturned,
          unitCost: item.unitCost,
          referenceDoc: returnNumber,
          actingUserId: user.id,
        });
      }
    }

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: 'CREATED_SUPPLIER_RETURN',
      resource: 'supplier_return',
      resourceId: supplierReturn.id,
      payload: { returnNumber, grnNumber: grn.grnNumber, reason: params.reason, status: autoApprove ? 'COMPLETED' : 'SUBMITTED' },
    });

    return supplierReturn;
  }, existingTx);
}

export async function approveSupplierReturn(
  checkerUser: AuthenticatedUser,
  returnId: string,
  existingTx?: Prisma.TransactionClient
) {
  return await withProcurementContext(checkerUser, async (tx) => {
    const sr = await tx.supplierReturn.findUnique({
      where: { id: returnId },
      include: { items: true },
    });

    if (!sr) throw new Error('RETURN_NOT_FOUND: Supplier return does not exist.');

    if (sr.createdByUserId === checkerUser.id) {
      throw new Error('DUAL_CONTROL_VIOLATION: Return creator cannot approve their own supplier return.');
    }

    if (sr.status === 'COMPLETED') {
      throw new Error('ALREADY_COMPLETED: Supplier return is already approved and processed.');
    }

    for (const item of sr.items) {
      await postStockTransaction(tx, {
        transactionType: 'RETURN_OUT',
        storeId: sr.storeId,
        partId: item.partId,
        quantity: Number(item.quantityReturned),
        unitCost: Number(item.unitCost),
        referenceDoc: sr.returnNumber,
        actingUserId: checkerUser.id,
      });
    }

    const updated = await tx.supplierReturn.update({
      where: { id: returnId },
      data: { status: 'COMPLETED' },
    });

    await appendAuditLog(tx, {
      actorUserId: checkerUser.id,
      action: 'APPROVED_SUPPLIER_RETURN',
      resource: 'supplier_return',
      resourceId: returnId,
      payload: { returnNumber: sr.returnNumber, status: 'COMPLETED' },
    });

    return updated;
  }, existingTx);
}

export async function getSupplierReturns(user: AuthenticatedUser, existingTx?: Prisma.TransactionClient) {
  return await withProcurementContext(user, async (tx) => {
    return tx.supplierReturn.findMany({
      include: {
        grn: { select: { id: true, grnNumber: true } },
        vendor: { select: { id: true, registeredName: true, code: true } },
        store: { select: { id: true, name: true, code: true } },
        createdByUser: { select: { id: true, name: true, email: true } },
        items: { include: { part: { select: { partNumber: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }, existingTx);
}

export async function getSupplierReturnById(user: AuthenticatedUser, id: string, existingTx?: Prisma.TransactionClient) {
  return await withProcurementContext(user, async (tx) => {
    const sr = await tx.supplierReturn.findUnique({
      where: { id },
      include: {
        grn: { select: { id: true, grnNumber: true, deliveryDate: true } },
        vendor: { select: { id: true, registeredName: true, code: true, email: true, phone: true } },
        store: { select: { id: true, name: true, code: true } },
        createdByUser: { select: { id: true, name: true, email: true } },
        items: { include: { part: { select: { id: true, partNumber: true, name: true, uom: true } } } },
      },
    });

    if (!sr) throw new Error('RETURN_NOT_FOUND: Supplier return does not exist.');
    return sr;
  }, existingTx);
}

/**
 * 6. THREE-WAY INVOICE MATCHING (PO - GRN - INVOICE)
 */
export async function performThreeWayMatch(
  user: AuthenticatedUser,
  params: {
    poId: string;
    grnId?: string;
    invoiceNumber?: string;
    invoiceAmount?: number;
  },
  existingTx?: Prisma.TransactionClient
) {
  return await withProcurementContext(user, async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: params.poId },
      include: {
        vendor: true,
        items: { include: { part: true } },
        goodsReceivedNotes: {
          include: { items: true },
        },
      },
    });

    if (!po) throw new Error('PO_NOT_FOUND: Target purchase order does not exist.');

    const grn = params.grnId
      ? po.goodsReceivedNotes.find((g: any) => g.id === params.grnId)
      : po.goodsReceivedNotes[0];

    const matchedLineItems: any[] = [];
    const discrepancies: string[] = [];

    const poSubtotal = Number(po.subtotal);
    const poTotal = Number(po.totalAmount);
    const invoicedTotal = params.invoiceAmount ?? poTotal;

    if (Math.abs(invoicedTotal - poTotal) > 0.01) {
      discrepancies.push(`PRICE_VARIANCE: Invoice amount (GHS ${invoicedTotal.toFixed(2)}) differs from PO total (GHS ${poTotal.toFixed(2)}).`);
    }

    if (!grn) {
      discrepancies.push('UNMATCHED_RECEIPT: No Goods Received Note found for this purchase order.');
    } else {
      for (const poItem of po.items) {
        const grnItem = grn.items.find((gi: any) => gi.poItemId === poItem.id);
        const qtyOrdered = Number(poItem.quantityOrdered);
        const qtyAccepted = grnItem ? Number(grnItem.quantityAccepted) : 0;

        if (qtyAccepted < qtyOrdered) {
          discrepancies.push(`QUANTITY_VARIANCE: Part "${poItem.description}" ordered ${qtyOrdered}, but GRN accepted ${qtyAccepted}.`);
        }

        matchedLineItems.push({
          description: poItem.description,
          orderedQuantity: qtyOrdered,
          acceptedQuantity: qtyAccepted,
          poUnitPrice: Number(poItem.unitPrice),
          status: qtyAccepted >= qtyOrdered ? 'MATCHED' : 'PARTIAL_RECEIPT',
        });
      }
    }

    const matchStatus = discrepancies.length === 0 ? 'MATCHED' : discrepancies.some(d => d.startsWith('PRICE')) ? 'PRICE_VARIANCE' : 'QUANTITY_VARIANCE';

    return {
      poNumber: po.poNumber,
      vendorName: po.vendor.registeredName,
      poTotal,
      invoicedTotal,
      grnNumber: grn?.grnNumber ?? 'N/A',
      matchStatus,
      discrepancies,
      lineItems: matchedLineItems,
    };
  }, existingTx);
}

/**
 * 7. EXECUTIVE DASHBOARD & METRICS
 */
export async function getProcurementMetrics(user: AuthenticatedUser, existingTx?: Prisma.TransactionClient) {
  return await withProcurementContext(user, async (tx) => {
    const branchFilter = user.accessScope === 'Company' ? undefined : user.branchId;

    const [
      requisitionsCount,
      pendingReqCount,
      openRfqsCount,
      pendingPoCount,
      activePoCount,
      pendingGrnCount,
      vendorsCount,
      pos,
    ] = await Promise.all([
      tx.purchaseRequisition.count({ where: { deletedAt: null, branchId: branchFilter } }),
      tx.purchaseRequisition.count({ where: { deletedAt: null, branchId: branchFilter, status: { in: ['SUBMITTED', 'PENDING_APPROVAL'] } } }),
      tx.rfq.count({ where: { status: { in: ['DRAFT', 'SENT'] } } }),
      tx.purchaseOrder.count({ where: { deletedAt: null, branchId: branchFilter, status: { in: ['DRAFT', 'PENDING_APPROVAL'] } } }),
      tx.purchaseOrder.count({ where: { deletedAt: null, branchId: branchFilter, status: { in: ['ISSUED', 'PARTIALLY_RECEIVED'] } } }),
      tx.goodsReceivedNote.count({
        where: {
          status: 'RECEIVED',
          ...(branchFilter ? { po: { branchId: branchFilter } } : {}),
        },
      }),
      tx.vendor.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      tx.purchaseOrder.findMany({
        where: { deletedAt: null, branchId: branchFilter },
        select: { totalAmount: true },
      }),
    ]);

    const totalSpend = pos.reduce((acc: number, item: any) => acc + Number(item.totalAmount), 0);

    return {
      requisitionsCount,
      pendingReqCount,
      openRfqsCount,
      pendingPoCount,
      activePoCount,
      pendingGrnCount,
      vendorsCount,
      totalSpend,
    };
  }, existingTx);
}

export async function getProcurementReports(
  user: AuthenticatedUser,
  reportType: string,
  filters?: { startDate?: string; endDate?: string; branchId?: string; vendorId?: string },
  existingTx?: Prisma.TransactionClient
) {
  return await withProcurementContext(user, async (tx) => {
    const branchFilter = user.accessScope === 'Company' ? (filters?.branchId ?? undefined) : user.branchId;

    if (reportType === 'PO_REGISTER') {
      return tx.purchaseOrder.findMany({
        where: {
          deletedAt: null,
          branchId: branchFilter,
          ...(filters?.vendorId ? { vendorId: filters.vendorId } : {}),
        },
        include: {
          vendor: { select: { registeredName: true, code: true } },
          branch: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (reportType === 'GRN_REGISTER') {
      return tx.goodsReceivedNote.findMany({
        where: {
          status: 'ACCEPTED',
          ...(branchFilter ? { po: { branchId: branchFilter } } : {}),
        },
        include: {
          vendor: { select: { registeredName: true, code: true } },
          store: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return tx.purchaseOrder.findMany({
      where: { deletedAt: null, branchId: branchFilter },
      take: 50,
    });
  }, existingTx);
}
