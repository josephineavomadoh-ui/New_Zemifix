import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { getPublicRequestIntakes } from '@/src/lib/services/workRequestService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const intakes = await getPublicRequestIntakes(user);
    return NextResponse.json({ intakes, count: intakes.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch public QR intake requests' }, { status: 500 });
  }
}
