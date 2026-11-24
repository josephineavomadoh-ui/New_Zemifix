import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { addWorkOrderAttachmentMetadata } from '@/src/lib/services/workOrderService';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'work_order', action: 'update' },
  async (req, { user, tx, params }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const { id } = params ?? {};
    if (!id) {
      return NextResponse.json({ error: 'Work order ID required' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const caption = (formData.get('caption') as string | null) ?? '';
    const evidenceType = (formData.get('evidenceType') as string | null) ?? 'GENERAL';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const mimeType = file.type;
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, and WebP images are permitted.' },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    if (fileBuffer.length > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File exceeds the 10 MB size limit.' },
        { status: 400 }
      );
    }

    const originalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${Date.now()}-${originalName}`;
    const uploadDir = path.join(process.cwd(), 'storage', 'uploads', 'work-orders');
    const absolutePath = path.join(uploadDir, fileName);

    // Prevent path traversal
    if (!absolutePath.startsWith(path.resolve(uploadDir))) {
      return NextResponse.json({ error: 'Invalid file name.' }, { status: 400 });
    }

    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(absolutePath, fileBuffer);

    const fileUrl = `work-orders/${fileName}`;

    const displayLabel = caption.trim()
      ? `[${evidenceType}] ${caption.trim()}`
      : `[${evidenceType}] ${file.name}`;

    const attachment = await addWorkOrderAttachmentMetadata(
      user,
      {
        workOrderId: id,
        fileName: displayLabel.substring(0, 200),
        fileUrl,
        fileSize: fileBuffer.length,
        mimeType,
        isCustomerVisible: false,
      },
      tx
    );

    return NextResponse.json({ attachment }, { status: 201 });
  }
);
