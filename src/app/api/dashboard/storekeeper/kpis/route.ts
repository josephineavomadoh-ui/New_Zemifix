import { NextResponse } from 'next/server';
import { hasPermission } from '@/src/lib/auth';
import { withApiSecurity } from '@/src/lib/authWrapper';

function canReadStock(user: { role?: { name?: string } }) {
  return (
    hasPermission(user as any, 'inventory', 'read') ||
    hasPermission(user as any, 'stock', 'issue') ||
    hasPermission(user as any, 'stock', 'read') ||
    /storekeeper|inventory/i.test(user.role?.name ?? '')
  );
}

/**
 * Storekeeper catalogue and stock totals for the signed-in user.
 */
export const GET = withApiSecurity(
  { realm: 'STAFF' },
  async (_req, { user, tx }) => {
    if (!user || !canReadStock(user)) {
      return NextResponse.json({ error: 'FORBIDDEN: Inventory access is required.' }, { status: 403 });
    }

    const [totalParts, outOfStock, stocks, valuationResult] = await Promise.all([
      tx.part.count({ where: { isActive: true } }),
      tx.stock.count({ where: { quantityOnHand: { lte: 0 } } }),
      tx.stock.findMany({ include: { part: { select: { reorderLevel: true } } } }),
      tx.stock.aggregate({ _sum: { totalValue: true } }),
    ]);

    const lowStock = stocks.filter(
      (s) => Number(s.quantityOnHand) > 0 && Number(s.quantityOnHand) <= Number(s.part.reorderLevel)
    ).length;

    return NextResponse.json({
      totalParts,
      outOfStock,
      lowStock,
      valuation: valuationResult._sum.totalValue ?? 0,
    });
  }
);
