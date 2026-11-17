import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { AuthenticatedUser } from '../auth';
import { generateUuidV7 } from '../uuid';
import { appendAuditLog } from './auditService';

export async function createVendor(
  user: AuthenticatedUser,
  params: {
    code: string;
    registeredName: string;
    tradingName?: string;
    vendorType?: string;
    contactPerson?: string;
    email: string;
    phone: string;
    address: string;
    ghanaPostGps?: string;
    country?: string;
    taxId?: string;
    vatRegistered?: boolean;
    paymentTermsDays?: number;
    bankDetails?: any;
    preferredVendor?: boolean;
  }
) {
  return await prisma.$transaction(async (tx: any) => {
    const vendorUuid = generateUuidV7();

    const vendor = await tx.vendor.create({
      data: {
        id: vendorUuid,
        code: params.code,
        registeredName: params.registeredName,
        tradingName: params.tradingName ?? null,
        vendorType: params.vendorType ?? 'SUPPLIER',
        contactPerson: params.contactPerson ?? null,
        email: params.email,
        phone: params.phone,
        address: params.address,
        ghanaPostGps: params.ghanaPostGps ?? null,
        country: params.country ?? 'Ghana',
        taxId: params.taxId ?? null,
        vatRegistered: params.vatRegistered ?? true,
        paymentTermsDays: params.paymentTermsDays ?? 30,
        bankDetails: params.bankDetails ?? {},
        preferredVendor: params.preferredVendor ?? false,
        branchId: user.branchId,
        status: 'ACTIVE',
      },
    });

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: 'CREATED_VENDOR',
      resource: 'vendor',
      resourceId: vendor.id,
      payload: { code: params.code, registeredName: params.registeredName, email: params.email },
    });

    return vendor;
  }, { timeout: 15000 });
}

export async function getVendors(search?: string) {
  return await prisma.vendor.findMany({
    where: {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { registeredName: { contains: search, mode: 'insensitive' } },
              { tradingName: { contains: search, mode: 'insensitive' } },
              { taxId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      purchaseOrders: { select: { id: true, poNumber: true, totalAmount: true, status: true } },
      goodsReceivedNotes: { select: { id: true, grnNumber: true, deliveryDate: true, status: true } },
      supplierReturns: { select: { id: true, returnNumber: true, reason: true } },
    },
    orderBy: { code: 'asc' },
  });
}

export async function getVendorById(user: AuthenticatedUser, id: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      purchaseOrders: {
        include: {
          items: { include: { part: { select: { partNumber: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      },
      goodsReceivedNotes: {
        include: {
          items: { include: { part: { select: { partNumber: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      },
      supplierReturns: {
        include: {
          items: { include: { part: { select: { partNumber: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      },
      rfqVendors: {
        include: { rfq: { select: { rfqNumber: true, title: true, status: true } } },
      },
    },
  });

  if (!vendor || vendor.deletedAt !== null) {
    throw new Error('VENDOR_NOT_FOUND: Vendor record does not exist.');
  }

  // Calculate Historical Performance Metrics
  const totalPos = vendor.purchaseOrders.length;
  const totalPurchaseVolume = vendor.purchaseOrders.reduce((sum, po) => sum + Number(po.totalAmount), 0);

  let onTimeDeliveries = 0;
  let totalGrns = vendor.goodsReceivedNotes.length;
  let totalAcceptedQty = 0;
  let totalReceivedQty = 0;

  for (const grn of vendor.goodsReceivedNotes) {
    const po = vendor.purchaseOrders.find((p) => p.id === grn.poId);
    if (po && po.expectedDeliveryDate && grn.deliveryDate <= po.expectedDeliveryDate) {
      onTimeDeliveries++;
    }

    for (const item of grn.items) {
      totalReceivedQty += Number(item.quantityReceived);
      totalAcceptedQty += Number(item.quantityAccepted);
    }
  }

  let totalReturnedQty = 0;
  for (const sr of vendor.supplierReturns) {
    for (const item of sr.items) {
      totalReturnedQty += Number(item.quantityReturned);
    }
  }

  const onTimeDeliveryRate = totalGrns > 0 ? Math.round((onTimeDeliveries / totalGrns) * 100) : 100;
  const qualityAcceptanceRate = totalReceivedQty > 0 ? Math.round((totalAcceptedQty / totalReceivedQty) * 100) : 100;
  const returnRate = totalAcceptedQty > 0 ? Math.round((totalReturnedQty / totalAcceptedQty) * 100) : 0;

  return {
    ...vendor,
    performanceMetrics: {
      totalPos,
      totalPurchaseVolume,
      totalGrns,
      onTimeDeliveryRate,
      qualityAcceptanceRate,
      returnRate,
    },
  };
}

export async function updateVendor(
  user: AuthenticatedUser,
  id: string,
  params: {
    registeredName?: string;
    tradingName?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    taxId?: string;
    vatRegistered?: boolean;
    paymentTermsDays?: number;
    bankDetails?: any;
    preferredVendor?: boolean;
    status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  }
) {
  return await prisma.$transaction(async (tx: any) => {
    const updated = await tx.vendor.update({
      where: { id },
      data: {
        ...(params.registeredName !== undefined ? { registeredName: params.registeredName } : {}),
        ...(params.tradingName !== undefined ? { tradingName: params.tradingName } : {}),
        ...(params.contactPerson !== undefined ? { contactPerson: params.contactPerson } : {}),
        ...(params.email !== undefined ? { email: params.email } : {}),
        ...(params.phone !== undefined ? { phone: params.phone } : {}),
        ...(params.address !== undefined ? { address: params.address } : {}),
        ...(params.taxId !== undefined ? { taxId: params.taxId } : {}),
        ...(params.vatRegistered !== undefined ? { vatRegistered: params.vatRegistered } : {}),
        ...(params.paymentTermsDays !== undefined ? { paymentTermsDays: params.paymentTermsDays } : {}),
        ...(params.bankDetails !== undefined ? { bankDetails: params.bankDetails } : {}),
        ...(params.preferredVendor !== undefined ? { preferredVendor: params.preferredVendor } : {}),
        ...(params.status !== undefined ? { status: params.status } : {}),
      },
    });

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: 'UPDATED_VENDOR',
      resource: 'vendor',
      resourceId: id,
      payload: params,
    });

    return updated;
  }, { timeout: 15000 });
}
