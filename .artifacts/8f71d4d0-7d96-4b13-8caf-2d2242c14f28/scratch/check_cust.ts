import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const customers = await prisma.customer.findMany({ include: { sites: true, contacts: true } });
  console.log('Customers count:', customers.length);
  for (const c of customers) {
    console.log(`- ${c.customerNumber}: ${c.name} (Sites: ${c.sites.length}, Contacts: ${c.contacts.length})`);
  }
  await prisma.$disconnect();
}
run();
