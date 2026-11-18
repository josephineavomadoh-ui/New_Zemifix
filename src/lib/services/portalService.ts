import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { AuthenticatedPortalContact } from '../portalAuth';
import { generateUuidV7 } from '../uuid';
import { appendAuditLog } from './auditService';

/**
 * Resolves authorized Customer Site IDs for a Portal Contact
 */
export async function getAuthorizedSiteIdsForContact(contact: AuthenticatedPortalContact): Promise<string[]> {
  const grants = await prisma.customerContactSiteGrant.findMany({
    where: { customerContactId: contact.id, customerId: contact.customerId },
    select: { customerSiteId: true },
  });

  if (grants.length > 0) {
    return grants.map((g) => g.customerSiteId);
  }

  // If no explicit grants and primary contact, allow all active sites for customer
  if (contact.isPrimaryContact) {
    const allSites = await prisma.customerSite.findMany({
      where: { customerId: contact.customerId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    return allSites.map((s) => s.id);
  }

  return [];
}

/**
 * Portal Work Orders Query with Site Isolation and Customer Visibility Filter
 */
export async function getPortalWorkOrders(contact: AuthenticatedPortalContact) {
  const siteIds = await getAuthorizedSiteIdsForContact(contact);

  return await prisma.workOrder.findMany({
    where: {
      customerId: contact.customerId,
      siteId: { in: siteIds },
      deletedAt: null,
    },
    select: {
      id: true,
      workOrderNumber: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      type: true,
      plannedStart: true,
      plannedEnd: true,
      actualStart: true,
      actualEnd: true,
      createdAt: true,
      site: { select: { id: true, name: true, siteCode: true } },
      asset: { select: { id: true, name: true, assetTag: true } },
      comments: {
        where: { isCustomerVisible: true },
        select: { id: true, commentText: true, createdAt: true, authorContact: { select: { name: true } } },
      },
      attachments: {
        where: { isCustomerVisible: true },
        select: { id: true, fileName: true, fileUrl: true, fileSize: true, mimeType: true, createdAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Unauthenticated Public / QR Request Intake
 */
export async function submitPublicQrRequest(params: {
  siteCode?: string;
  assetTag?: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  description: string;
  photoUrl?: string;
  clientIp: string;
  idempotencyKey?: string;
}) {
  return await prisma.$transaction(async (tx: any) => {
    // 0. Idempotency Check
    if (params.idempotencyKey) {
      const existing = await tx.publicRequestIntake.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing) return existing;
    }

    // 1. Resolve Target Asset, Customer Site, or Branch on Server
    let targetAsset: any = null;
    let site: any = null;
    let branch: any = null;

    if (params.assetTag) {
      targetAsset = await tx.asset.findFirst({
        where: {
          assetTag: { equals: params.assetTag, mode: 'insensitive' },
          deletedAt: null,
          isActive: true,
        },
      });

      if (!targetAsset) {
        throw new Error('INVALID_ASSET_REFERENCE: Target asset tag does not exist or is inactive.');
      }

      if (targetAsset.siteId) {
        site = await tx.customerSite.findUnique({
          where: { id: targetAsset.siteId, deletedAt: null, isActive: true },
        });
        if (!site) {
          throw new Error('INVALID_SITE_REFERENCE: Target customer site does not exist or is inactive.');
        }
      } else if (targetAsset.branchId) {
        branch = await tx.branch.findUnique({
          where: { id: targetAsset.branchId, deletedAt: null, isActive: true },
        });
        if (!branch) {
          throw new Error('INVALID_BRANCH_REFERENCE: Target internal branch does not exist or is inactive.');
        }
      }
    }

    if (!site && !branch && params.siteCode) {
      site = await tx.customerSite.findFirst({
        where: {
          siteCode: { equals: params.siteCode, mode: 'insensitive' },
          deletedAt: null,
          isActive: true,
        },
      });

      if (!site) {
        branch = await tx.branch.findFirst({
          where: {
            code: { equals: params.siteCode, mode: 'insensitive' },
            deletedAt: null,
            isActive: true,
          },
        });

        if (!branch) {
          throw new Error('INVALID_SITE_REFERENCE: Target customer site code or branch code does not exist or is inactive.');
        }
      }
    }

    if (!site && !branch) {
      throw new Error('INVALID_REFERENCE: Target site, customer asset, or internal branch reference is required and must be valid.');
    }

    // 2. Anti-Spam Rate Limit: Check max 10 submissions per IP in 60 minutes
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentSubmissions = await tx.publicRequestIntake.count({
      where: {
        clientIp: params.clientIp,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentSubmissions >= 10) {
      throw new Error('RATE_LIMIT_EXCEEDED: Maximum 10 public QR submissions allowed per hour per IP.');
    }

    // 3. Create Public Intake Record
    const intake = await tx.publicRequestIntake.create({
      data: {
        id: generateUuidV7(),
        siteId: site ? site.id : null,
        branchId: branch ? branch.id : null,
        assetId: targetAsset ? targetAsset.id : null,
        idempotencyKey: params.idempotencyKey ?? null,
        requesterName: params.requesterName,
        requesterEmail: params.requesterEmail,
        requesterPhone: params.requesterPhone,
        description: params.description,
        photoUrl: params.photoUrl ?? null,
        status: 'RECEIVED',
        clientIp: params.clientIp,
      },
    });

    return intake;
  });
}
