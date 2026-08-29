const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const latestOrder = await prisma.order.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(latestOrder, null, 2));
}
main().finally(() => prisma.$disconnect());
