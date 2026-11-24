import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { createStore, getStores } from '@/src/lib/services/inventoryService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'inventory', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const stores = await getStores(user, tx);
    return NextResponse.json({ stores, count: stores.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'inventory', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const body = await req.json();
    const store = await createStore(user, body, tx);

    return NextResponse.json({ success: true, store }, { status: 201 });
  }
);
