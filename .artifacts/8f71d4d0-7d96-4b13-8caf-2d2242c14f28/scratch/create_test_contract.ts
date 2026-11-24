import { PrismaClient } from '@prisma/client';
import { createCustomerContract, createContractRateCard } from '../../../src/lib/services/contractService';

const prisma = new PrismaClient();

async function run() {
  console.log('--- Creating Test Contract & Rate Cards ---');

  const adminUser = await prisma.user.findFirst({
    where: { email: 'admin@zemifix.local' },
    include: { role: true, branch: true, department: true },
  });

  if (!adminUser) {
    throw new Error('Admin user not found');
  }

  const customerId = '01a209d7-31b8-7c75-b465-4d8908ab8fd7';
  const siteId = '01a209d7-3629-7c06-b49d-58fdd9cb3a10';

  // Check if contract already exists
  const existing = await prisma.customerContract.findFirst({
    where: { customerId, title: 'ZemiFix Demo Annual Maintenance Contract' },
  });

  let contract = existing;
  if (!contract) {
    contract = await createCustomerContract(adminUser as any, {
      customerId,
      title: 'ZemiFix Demo Annual Maintenance Contract',
      description: 'Comprehensive maintenance agreement covering HVAC and electrical systems at ZemiFix Demo Maintenance Site.',
      startDate: new Date('2027-01-01T00:00:00Z'),
      endDate: new Date('2027-12-31T23:59:59Z'),
      billingFrequency: 'MONTHLY',
      contractValue: 25000.00,
      siteIds: [siteId],
    });
    console.log('[Test] Created Contract:', contract.id, contract.contractNumber);
  } else {
    console.log('[Test] Contract already exists:', contract.id);
  }

  // Create Rate Cards
  const rateCardRegular = await createContractRateCard(adminUser as any, {
    contractId: contract.id,
    category: 'REGULAR',
    hourlyRate: 150.00,
  });

  const rateCardEmergency = await createContractRateCard(adminUser as any, {
    contractId: contract.id,
    category: 'EMERGENCY',
    hourlyRate: 350.00,
  });

  console.log('[Test] Rate Cards Created:', rateCardRegular.id, rateCardEmergency.id);

  // Verify
  const verifiedContract = await prisma.customerContract.findUnique({
    where: { id: contract.id },
    include: {
      customer: true,
      contractSites: { include: { site: true } },
      rateCards: true,
    },
  });

  console.log('--- Contract Verification ---');
  console.log('Contract Number:', verifiedContract?.contractNumber);
  console.log('Customer:', verifiedContract?.customer.name);
  console.log('Covered Sites:', verifiedContract?.contractSites.map((cs) => cs.site.name));
  console.log('Rate Cards:', verifiedContract?.rateCards.length);

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
