import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getVendorById, updateVendor } from '@/src/lib/services/vendorService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'Vendor ID required' }, { status: 400 });

    const vendor = await getVendorById(user, id, tx);
    return NextResponse.json({ vendor });
  }
);

export const PATCH = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'update' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'Vendor ID required' }, { status: 400 });

    const body = await req.json();

    const vendor = await updateVendor(user, id, body, tx);
    return NextResponse.json({ success: true, vendor });
  }
);
