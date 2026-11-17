import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { prisma } from '@/src/lib/prisma';
import { getScopedWorkOrderFilter } from '@/src/lib/services/workOrderService';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let user;
    try {
      user = await getCurrentUser(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const body = await req.json();
    const { body: commentText, isCustomerVisible } = body;

    if (!commentText || typeof commentText !== 'string' || commentText.trim() === '') {
      return NextResponse.json({ error: 'Comment body is required' }, { status: 400 });
    }

    // Verify the work order exists and is accessible within the user's scope
    const scopeFilter = await getScopedWorkOrderFilter(user);
    const workOrder = await prisma.workOrder.findFirst({
      where: { id, ...scopeFilter },
    });

    if (!workOrder) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    }

    const comment = await prisma.workOrderComment.create({
      data: {
        workOrderId: id,
        authorUserId: user.id,
        commentText: commentText.trim(),
        isCustomerVisible: isCustomerVisible ?? false,
      },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err: any) {
    console.error('[API /api/work-orders/[id]/comments POST error]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
