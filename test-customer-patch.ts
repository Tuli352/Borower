import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const customer = await prisma.customer.findFirst();
  if (!customer) {
    console.log('No customers found to test.');
    return;
  }

  console.log(`Testing update on customer ${customer.id}`);

  try {
    const res = await prisma.customer.update({
      where: { id: customer.id },
      data: { status: customer.status === 'Active' ? 'Blocked' : 'Active' }
    });
    console.log('Direct Prisma update worked:', res);
  } catch (err) {
    console.error('Prisma Error:', err);
  }
}

main().finally(() => prisma.$disconnect());
