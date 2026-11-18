import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { checkRateLimit } from '@/src/lib/services/rateLimitService';

export async function GET(req: NextRequest) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateCheck = await checkRateLimit(clientIp, 'PUBLIC_QR_RESOLVE', 30, 60);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate Limit Exceeded', retryAfterSeconds: rateCheck.retryAfterSeconds },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const siteCode = searchParams.get('siteCode') || searchParams.get('site');
    const assetTag = searchParams.get('assetTag') || searchParams.get('asset') || searchParams.get('tag');
    const locationCode = searchParams.get('locationCode') || searchParams.get('location');

    if (!siteCode && !assetTag && !locationCode) {
      return NextResponse.json({ error: 'Missing QR code parameters.' }, { status: 400 });
    }

    let resolvedSite: any = null;
    let resolvedAsset: any = null;
    let resolvedLocation: any = null;

    // 1. Resolve Asset if tag provided
    if (assetTag) {
      const asset = await prisma.asset.findFirst({
        where: {
          assetTag: { equals: assetTag, mode: 'insensitive' },
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          assetTag: true,
          category: { select: { name: true } },
          site: { select: { id: true, name: true, siteCode: true, address: true } },
          location: { select: { id: true, name: true, code: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
      });

      if (asset) {
        resolvedAsset = {
          name: asset.name,
          assetTag: asset.assetTag,
          categoryName: asset.category?.name ?? 'Equipment',
          locationName: asset.location?.name ?? asset.site?.name ?? asset.branch?.name ?? null,
        };
        if (asset.site) {
          resolvedSite = {
            name: asset.site.name,
            siteCode: asset.site.siteCode,
            address: asset.site.address,
          };
        } else if (asset.branch) {
          resolvedSite = {
            name: asset.branch.name,
            siteCode: asset.branch.code,
            address: asset.branch.name,
          };
        }
      }
    }

    // 2. Resolve Site if not already resolved by asset
    if (!resolvedSite && siteCode) {
      const site = await prisma.customerSite.findFirst({
        where: {
          siteCode: { equals: siteCode, mode: 'insensitive' },
          isActive: true,
          deletedAt: null,
        },
        select: { name: true, siteCode: true, address: true },
      });

      if (site) {
        resolvedSite = {
          name: site.name,
          siteCode: site.siteCode,
          address: site.address,
        };
      } else {
        // Fallback check for internal branch code
        const branch = await prisma.branch.findFirst({
          where: {
            code: { equals: siteCode, mode: 'insensitive' },
            deletedAt: null,
          },
          select: { name: true, code: true },
        });

        if (branch) {
          resolvedSite = {
            name: branch.name,
            siteCode: branch.code,
            address: branch.name,
          };
        }
      }
    }

    // 3. Resolve Location if code provided
    if (locationCode) {
      const loc = await prisma.location.findFirst({
        where: {
          code: { equals: locationCode, mode: 'insensitive' },
          isActive: true,
          deletedAt: null,
        },
        select: { name: true, code: true },
      });
      if (loc) {
        resolvedLocation = { name: loc.name, code: loc.code };
      }
    }

    if (!resolvedSite && !resolvedAsset) {
      return NextResponse.json(
        { error: 'INVALID_QR_CODE: Scanned QR code parameters do not match any active site or asset.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      site: resolvedSite,
      asset: resolvedAsset,
      location: resolvedLocation,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Failed to resolve QR code metadata.' },
      { status: 500 }
    );
  }
}
