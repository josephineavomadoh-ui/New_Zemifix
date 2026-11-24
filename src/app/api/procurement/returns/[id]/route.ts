import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getSupplierReturnById, approveSupplierReturn } from '@/src/lib/services/procurementService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'Supplier return ID required' }, { status: 400 });

    const supplierReturn = await getSupplierReturnById(user, id, tx);
    return NextResponse.json({ supplierReturn });
  }
);

export const PATCH = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'approve' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'Supplier return ID required' }, { status: 400 });

    const result = await approveSupplierReturn(user, id, tx);
    return NextResponse.json({ success: true, result });
  }
);
