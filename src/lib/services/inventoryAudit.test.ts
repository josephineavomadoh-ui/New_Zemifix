// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { prisma } from '../prisma';

describe('Inventory Phase 6B Read-Only Database Audit', () => {
  it('inspects inventory database snapshot and ledger without modifying records', async () => {
    const partsCount = await prisma.part.count({ where: { deletedAt: null } });
    const storesCount = await prisma.store.count({ where: { deletedAt: null } });
    const stockCount = await prisma.stock.count();
    const txnCount = await prisma.stockTransaction.count();
    const transfersCount = await prisma.storeTransfer.count();
    const adjustmentsCount = await prisma.stockAdjustment.count();

    console.log('--- INVENTORY DATABASE SNAPSHOT ---');
    console.log(`Parts count: ${partsCount}`);
    console.log(`Stores count: ${storesCount}`);
    console.log(`Stock balance rows: ${stockCount}`);
    console.log(`Stock transactions count: ${txnCount}`);
    console.log(`Store transfers count: ${transfersCount}`);
    console.log(`Stock adjustments count: ${adjustmentsCount}`);

    const txns = await prisma.stockTransaction.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: { part: true, store: true },
    });

    console.log(`Fetched recent transactions: ${txns.length}`);
    expect(partsCount).toBeGreaterThanOrEqual(0);
  });
});
