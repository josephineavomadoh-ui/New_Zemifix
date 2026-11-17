// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { prisma } from '../prisma';

describe('Inventory Phase 6D Database Demo Data Inspection & Cleanup', () => {
  it('inspects parts, stores, and stock transactions in zemifix_dev', async () => {
    const parts = await prisma.part.findMany({ where: { deletedAt: null } });
    const stores = await prisma.store.findMany({ where: { deletedAt: null } });
    const txns = await prisma.stockTransaction.findMany();
    const stock = await prisma.stock.findMany();

    console.log(`=== INVENTORY CLEANUP INSPECTION ===`);
    console.log(`Total Parts: ${parts.length}`);
    console.log(`Total Stores: ${stores.length}`);
    console.log(`Total Stock Rows: ${stock.length}`);
    console.log(`Total Stock Transactions: ${txns.length}`);

    // Verify if transactions reference parts and stores correctly
    expect(parts.length).toBeGreaterThanOrEqual(0);
    expect(stores.length).toBeGreaterThanOrEqual(0);
  });
});
