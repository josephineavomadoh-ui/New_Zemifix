import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { getVendorById, updateVendor } from '@/src/lib/services/vendorService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const vendor = await getVendorById(user, id);
    return NextResponse.json({ vendor });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch vendor' }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const vendor = await updateVendor(user, id, body);
    return NextResponse.json({ success: true, vendor });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to update vendor' }, { status: 400 });
  }
}
