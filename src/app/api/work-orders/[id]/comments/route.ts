import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { createWorkOrderComment } from '@/src/lib/services/workOrderService';

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'work_order', action: 'update' },
  async (req, { user, tx, params }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const { id } = params ?? {};
    if (!id) {
      return NextResponse.json({ error: 'Work order ID required' }, { status: 400 });
    }

    const body = await req.json();
    const { body: commentText, isCustomerVisible } = body;

    if (!commentText || typeof commentText !== 'string' || commentText.trim() === '') {
      return NextResponse.json({ error: 'Comment body is required' }, { status: 400 });
    }

    const comment = await createWorkOrderComment(
      user,
      {
        workOrderId: id,
        commentText: commentText.trim(),
        isCustomerVisible: isCustomerVisible ?? false,
      },
      tx
    );

    return NextResponse.json({ comment }, { status: 201 });
  }
);
