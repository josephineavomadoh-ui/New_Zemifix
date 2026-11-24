import { PrismaClient } from '@prisma/client';
import { createQuote, submitQuoteForApproval } from '../../../src/lib/services/quoteService';

const prisma = new PrismaClient();

async function run() {
  console.log('--- Running Contractor Mode E2E Workflow Test ---');

  const adminUser = await prisma.user.findFirst({
    where: { email: 'admin@zemifix.local' },
  });
  if (!adminUser) throw new Error('Admin user not found');

  const customerId = '01a209d7-31b8-7c75-b465-4d8908ab8fd7';
  const siteId = '01a209d7-3629-7c06-b49d-58fdd9cb3a10';

  // 1. Create Quotation
  const quote = await createQuote(adminUser as any, {
    customerId,
    siteId,
    title: 'HVAC Comprehensive Repair & Servicing Quote',
    validUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    items: [
      { description: 'Replace compressor unit', quantity: 1, unitPrice: 3500.00 },
      { description: 'Technician labor (hours)', quantity: 8, unitPrice: 150.00 },
    ],
  });
  console.log('[E2E] Created Quote:', quote.quoteNumber, 'Total:', quote.totalAmount.toString());

  // 2. Submit Quote for Approval
  const submitted = await submitQuoteForApproval(adminUser as any, quote.id);
  console.log('[E2E] Submitted Quote for Approval. Status:', submitted.status);

  console.log('--- E2E Workflow Test Completed Successfully ---');
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
