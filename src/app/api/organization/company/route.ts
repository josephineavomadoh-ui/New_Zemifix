import { NextResponse } from 'next/server';
import { getCompany, updateCompany } from '@/src/lib/services/organizationService';
import { handleApiError } from '@/src/lib/db-errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const comp = await getCompany();
    return NextResponse.json(comp);
  } catch (error: any) {
    const { status, body } = handleApiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const result = await updateCompany(body);
    return NextResponse.json(result);
  } catch (error: any) {
    const { status, body } = handleApiError(error);
    return NextResponse.json(body, { status });
  }
}
