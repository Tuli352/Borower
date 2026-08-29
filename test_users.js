const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const accounts = await prisma.account.findMany({ select: { id: true, email: true, phone: true } });
  console.log('Accounts:', accounts);
}
main().finally(() => prisma.$disconnect());
