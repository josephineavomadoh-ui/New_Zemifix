import { PrismaClient } from '@prisma/client';
import { generateUuidV7 } from '../../../src/lib/uuid';
import { createCustomerContact } from '../../../src/lib/services/customerService';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function run() {
  console.log('--- Creating Test Customer, Site & Contact ---');

  // Check if ZF-DEMO-CUST-001 already exists
  let customer = await prisma.customer.findUnique({
    where: { customerNumber: 'ZF-DEMO-CUST-001' },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        id: generateUuidV7(),
        customerNumber: 'ZF-DEMO-CUST-001',
        name: 'ZemiFix Contractor Demo Customer',
        primaryEmail: 'demo.customer@zemifix.local',
        primaryPhone: '+233 24 555 6677',
        billingAddress: 'Plot 10 Industrial Area, Accra',
        taxId: 'GH-TAX-99887766',
        paymentTermsDays: 30,
        creditLimit: 50000.00,
        isActive: true,
      },
    });
    console.log('[Test] Created Customer:', customer.id, customer.name);
  } else {
    console.log('[Test] Customer already exists:', customer.id);
  }

  // Create Site
  let site = await prisma.customerSite.findFirst({
    where: { customerId: customer.id, siteCode: 'ZF-DEMO-SITE-001' },
  });

  if (!site) {
    site = await prisma.customerSite.create({
      data: {
        id: generateUuidV7(),
        customerId: customer.id,
        siteCode: 'ZF-DEMO-SITE-001',
        name: 'ZemiFix Demo Maintenance Site',
        address: 'Local Development Test Site, Workshop Bay 4',
        primaryContactName: 'Kofi Demo',
        primaryContactPhone: '+233 24 555 6678',
        isActive: true,
      },
    });
    console.log('[Test] Created Site:', site.id, site.name);
  } else {
    console.log('[Test] Site already exists:', site.id);
  }

  // Create Contact
  let contact = await prisma.customerContact.findFirst({
    where: { customerId: customer.id, email: 'demo.customer@zemifix.local' },
  });

  if (!contact) {
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@zemifix.local' } });
    if (adminUser) {
      contact = await createCustomerContact(adminUser as any, {
        customerId: customer.id,
        name: 'Demo Customer Contact',
        email: 'demo.customer@zemifix.local',
        phone: '+233 24 555 6679',
        isPrimaryContact: true,
        canViewFinancials: true,
        canApproveQuotes: true,
      });
      console.log('[Test] Created Contact:', contact.id, contact.name);
    }
  } else {
    console.log('[Test] Contact already exists:', contact.id);
  }

  // Verify Data Integrity
  const verifiedCust = await prisma.customer.findUnique({
    where: { id: customer.id },
    include: { sites: true, contacts: true },
  });

  console.log('--- Verification ---');
  console.log('Customer:', verifiedCust?.name);
  console.log('Sites count:', verifiedCust?.sites.length);
  console.log('Contacts count:', verifiedCust?.contacts.length);

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
