import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { checkRateLimit } from '@/src/lib/services/rateLimitService';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateCheck = await checkRateLimit(clientIp, 'PUBLIC_UPLOAD', 5, 60);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate Limit Exceeded', retryAfterSeconds: rateCheck.retryAfterSeconds },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No image file provided.' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'INVALID_FILE_TYPE: Only JPEG, PNG, and WebP images are allowed.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'FILE_TOO_LARGE: Image size cannot exceed 10 MB.' },
        { status: 400 }
      );
    }

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), 'storage', 'uploads', 'public-intake');
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${Date.now()}-${safeName}`;
    const filePath = path.join(uploadDir, fileName);

    // Path traversal guard
    if (!filePath.startsWith(uploadDir)) {
      return NextResponse.json({ error: 'INVALID_FILE_PATH' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(filePath, buffer);

    const fileUrl = `/api/public/uploads/${fileName}`;

    return NextResponse.json(
      {
        success: true,
        fileUrl,
        fileName: safeName,
        fileSize: file.size,
        mimeType: file.type,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Public photo upload failed.' },
      { status: 500 }
    );
  }
}
