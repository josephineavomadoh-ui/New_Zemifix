import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { createPart, getParts } from '@/src/lib/services/inventoryService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'inventory', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') ?? undefined;
    const category = searchParams.get('category') ?? undefined;

    const parts = await getParts(user, search, category, tx);
    return NextResponse.json({ parts, count: parts.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'inventory', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const body = await req.json();
    const part = await createPart(user, body, tx);

    return NextResponse.json({ success: true, part }, { status: 201 });
  }
);
