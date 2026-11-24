import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { createVendor, getVendors } from '@/src/lib/services/vendorService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') ?? undefined;

    const vendors = await getVendors(user, search, tx);
    return NextResponse.json({ vendors, count: vendors.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const body = await req.json();
    const vendor = await createVendor(user, body, tx);

    return NextResponse.json({ success: true, vendor }, { status: 201 });
  }
);
