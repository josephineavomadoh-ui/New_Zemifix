import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPlatformAdmin } from '@/src/lib/platformAuth';

export async function GET(req: NextRequest) {
  try {
    const admin = await getCurrentPlatformAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ admin });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch current admin' }, { status: 500 });
  }
}
