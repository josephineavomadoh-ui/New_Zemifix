import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getCurrentUser } from '@/src/lib/auth';
import { prisma } from '@/src/lib/prisma';
import { saveAssetImage, getAssetImagePath, deleteAssetImage } from '@/src/lib/services/storageService';
import { appendAuditLog } from '@/src/lib/services/auditService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const asset = await prisma.asset.findUnique({
      where: { id },
      select: { id: true, imageUrl: true, deletedAt: true },
    });

    if (!asset || asset.deletedAt !== null) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    if (!asset.imageUrl) {
      return NextResponse.json({ error: 'No image found for this asset' }, { status: 404 });
    }

    const absolutePath = getAssetImagePath(asset.imageUrl);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return NextResponse.json({ error: 'Image file not found on server storage' }, { status: 404 });
    }

    const fileBuffer = await fs.promises.readFile(absolutePath);
    let contentType = 'image/jpeg';
    if (asset.imageUrl.endsWith('.png')) contentType = 'image/png';
    else if (asset.imageUrl.endsWith('.webp')) contentType = 'image/webp';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: any) {
    console.error('[API Asset Image GET error]:', err);
    return NextResponse.json({ error: err.message ?? 'Failed to retrieve asset image' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleImageUpload(req, params);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleImageUpload(req, params);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleImageUpload(req, params);
}

async function handleImageUpload(req: NextRequest, paramsPromise: Promise<{ id: string }>) {
  let newStorageRef: string | null = null;
  try {
    const { id } = await paramsPromise;
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('image') || formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No valid image file provided in form data.' }, { status: 400 });
    }

    const arrayBuffer = await (file as File).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = (file as File).type || 'image/jpeg';

    // 1. Save and validate new image first (failure-safe step 1)
    newStorageRef = await saveAssetImage(buffer, mimeType);

    const asset = await prisma.asset.findUnique({
      where: { id },
      select: { id: true, imageUrl: true, assetTag: true },
    });

    if (!asset) {
      // Clean up newly uploaded file if asset doesn't exist
      await deleteAssetImage(newStorageRef);
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const oldImageUrl = asset.imageUrl;

    // 2. Update database reference safely
    const updatedAsset = await prisma.$transaction(async (tx: any) => {
      const updated = await tx.asset.update({
        where: { id },
        data: { imageUrl: newStorageRef },
      });

      await appendAuditLog(tx, {
        actorUserId: user.id,
        action: 'UPLOADED_ASSET_IMAGE',
        resource: 'asset',
        resourceId: id,
        payload: { assetTag: asset.assetTag, imageUrl: newStorageRef },
      });

      return updated;
    });

    // 3. Remove previous image only AFTER successful database persistence
    if (oldImageUrl && oldImageUrl !== newStorageRef) {
      await deleteAssetImage(oldImageUrl);
    }

    return NextResponse.json({ success: true, asset: updatedAsset });
  } catch (err: any) {
    console.error('[API Asset Image Upload error]:', err);
    // 4. Clean up newly uploaded file if database operation fails
    if (newStorageRef) {
      await deleteAssetImage(newStorageRef);
    }
    return NextResponse.json({ error: err.message ?? 'Failed to upload asset image' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const asset = await prisma.asset.findUnique({
      where: { id },
      select: { id: true, imageUrl: true, assetTag: true },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const oldImageUrl = asset.imageUrl;

    const updatedAsset = await prisma.$transaction(async (tx: any) => {
      const updated = await tx.asset.update({
        where: { id },
        data: { imageUrl: null },
      });

      await appendAuditLog(tx, {
        actorUserId: user.id,
        action: 'REMOVED_ASSET_IMAGE',
        resource: 'asset',
        resourceId: id,
        payload: { assetTag: asset.assetTag },
      });

      return updated;
    });

    if (oldImageUrl) {
      await deleteAssetImage(oldImageUrl);
    }

    return NextResponse.json({ success: true, asset: updatedAsset });
  } catch (err: any) {
    console.error('[API Asset Image DELETE error]:', err);
    return NextResponse.json({ error: err.message ?? 'Failed to remove asset image' }, { status: 400 });
  }
}
