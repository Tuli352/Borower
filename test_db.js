const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const riders = await prisma.rider.findMany({
    where: { status: 'Online' },
    include: {
      orders: {
        where: {
          status: { in: ['Accepted', 'Arrived', 'DriverArrived', 'PickedUp', 'AtDropoff', 'InProgress'] }
        }
      }
    }
  });
  console.log(JSON.stringify(riders, null, 2));
}
main().finally(() => prisma.$disconnect());
