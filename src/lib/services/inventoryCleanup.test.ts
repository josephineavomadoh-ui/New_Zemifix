// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { prisma } from '../prisma';

describe('Inventory Phase 6D Database Demo Data Cleanup Execution', () => {
  it('safely cleans integration test parts, stores, stock, and transactions from zemifix_dev', async () => {
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Delete stock transactions
      const txnsDeleted = await tx.stockTransaction.deleteMany({});
      // 2. Delete stock balance rows
      const stockDeleted = await tx.stock.deleteMany({});
      // 3. Delete parts catalogue items
      const partsDeleted = await tx.part.deleteMany({});
      // 4. Delete stores and warehouses
      const storesDeleted = await tx.store.deleteMany({});

      return {
        txnsDeleted: txnsDeleted.count,
        stockDeleted: stockDeleted.count,
        partsDeleted: partsDeleted.count,
        storesDeleted: storesDeleted.count,
      };
    });

    console.log('=== INVENTORY CLEANUP EXECUTION RESULTS ===');
    console.log(`Stock Transactions Deleted: ${result.txnsDeleted}`);
    console.log(`Stock Balances Deleted: ${result.stockDeleted}`);
    console.log(`Parts Deleted: ${result.partsDeleted}`);
    console.log(`Stores Deleted: ${result.storesDeleted}`);

    const finalParts = await prisma.part.count();
    const finalStores = await prisma.store.count();
    const finalTxns = await prisma.stockTransaction.count();

    console.log(`Final Parts Count: ${finalParts}`);
    console.log(`Final Stores Count: ${finalStores}`);
    console.log(`Final Transactions Count: ${finalTxns}`);

    expect(finalParts).toBe(0);
    expect(finalStores).toBe(0);
    expect(finalTxns).toBe(0);
  });
});
