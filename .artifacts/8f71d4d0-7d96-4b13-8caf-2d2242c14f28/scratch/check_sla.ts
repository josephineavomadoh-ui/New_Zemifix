import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const policies = await prisma.serviceLevelAgreement.findMany();
  console.log('SLA Policies:', policies.length);
  for (const pol of policies) {
    console.log(`- ${pol.id}: ${pol.policyNumber} (${pol.name})`);
  }
  await prisma.$disconnect();
}
run();
