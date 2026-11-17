// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { prisma } from '../prisma';

describe('Inventory Phase 6E Read-Only Data Readiness Audit', () => {
  it('inspects parts, stores, stock balances, and transactions in zemifix_dev', async () => {
    const parts = await prisma.part.findMany({
      where: { deletedAt: null },
      include: { stocks: true },
    });

    const stores = await prisma.store.findMany({
      where: { deletedAt: null },
      include: { branch: true },
    });

    const stockRows = await prisma.stock.findMany({
      include: { store: true, part: true },
    });

    const transactions = await prisma.stockTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      include: { part: true, store: true, actingUser: true },
    });

    console.log(`=== PHASE 6E READ-ONLY AUDIT SNAPSHOT ===`);
    console.log(`Total Parts: ${parts.length}`);
    console.log(`Total Stores: ${stores.length}`);
    console.log(`Total Stock Rows: ${stockRows.length}`);
    console.log(`Total Transactions: ${transactions.length}`);

    console.log('\n--- SAMPLE PARTS ---');
    parts.slice(0, 5).forEach((p) => {
      console.log(`ID: ${p.id} | SKU: ${p.partNumber} | Name: ${p.name} | Category: ${p.category} | AvgCost: ${p.averageCost}`);
    });

    console.log('\n--- SAMPLE STORES ---');
    stores.slice(0, 5).forEach((s) => {
      console.log(`ID: ${s.id} | Code: ${s.code} | Name: ${s.name} | Branch: ${s.branch?.name}`);
    });

    console.log('\n--- STOCK BALANCES ---');
    stockRows.forEach((st) => {
      console.log(`Store: ${st.store.name} | Part: ${st.part.partNumber} | QtyOnHand: ${st.quantityOnHand} | WAC: ${st.averageUnitCost} | TotalVal: ${st.totalValue}`);
    });

    expect(parts.length).toBe(22);
    expect(stores.length).toBe(24);
    expect(transactions.length).toBe(55);
  });
});
