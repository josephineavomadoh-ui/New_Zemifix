import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const safeFilename = path.basename(filename);
    const uploadDir = path.join(process.cwd(), 'storage', 'uploads', 'public-intake');
    const filePath = path.join(uploadDir, safeFilename);

    if (!filePath.startsWith(uploadDir)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileBuffer = await fs.readFile(filePath);

    let contentType = 'image/jpeg';
    if (safeFilename.endsWith('.png')) contentType = 'image/png';
    else if (safeFilename.endsWith('.webp')) contentType = 'image/webp';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to serve image file.' }, { status: 500 });
  }
}
