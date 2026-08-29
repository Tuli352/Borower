import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check if we have customers and riders
  let customer = await prisma.customer.findFirst();
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '1234567890',
        status: 'Active',
      }
    });
  }

  let rider = await prisma.rider.findFirst();
  if (!rider) {
    rider = await prisma.rider.create({
      data: {
        name: 'John Smith',
        email: 'john@example.com',
        phone: '0987654321',
        status: 'Active',
        vehicle: 'Honda CG125',
        plateNumber: 'KGI-123-XY',
      }
    });
  }

  console.log('Clearing existing orders...');
  await prisma.order.deleteMany({});

  console.log('Seeding new orders...');
  const ordersData = [
    {
      customerId: customer.id,
      riderId: rider.id,
      status: 'Delivered',
      amount: 45.0,
      pickupLocation: 'Downtown Market',
      dropoffLocation: 'GRA Phase 2',
      distance: 5.2,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5) // 5 hours ago
    },
    {
      customerId: customer.id,
      riderId: rider.id,
      status: 'On the Way',
      amount: 25.5,
      pickupLocation: 'Lokoja Hub',
      dropoffLocation: 'University Campus',
      distance: 3.1,
      createdAt: new Date(Date.now() - 1000 * 60 * 30) // 30 mins ago
    },
    {
      customerId: customer.id,
      riderId: null,
      status: 'Pending',
      amount: 15.0,
      pickupLocation: 'Old Town',
      dropoffLocation: 'Lokongoma',
      distance: 2.0,
      createdAt: new Date()
    }
  ];

  for (const order of ordersData) {
    await prisma.order.create({ data: order });
  }

  console.log('Database seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
