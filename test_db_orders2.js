const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const latestOrder = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3
  });
  console.log(JSON.stringify(latestOrder, null, 2));
}
main().finally(() => prisma.$disconnect());
