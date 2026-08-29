import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding dummy data...');

  // 1. Seed Accounts and Customers
  const customer1Account = await prisma.account.upsert({
    where: { phone: '+2348011111111' },
    update: {},
    create: {
      phone: '+2348011111111',
      email: 'john@example.com',
      isVerified: true,
      hasCustomerProfile: true,
    }
  });

  const customer1 = await prisma.customer.upsert({
    where: { accountId: customer1Account.id },
    update: {},
    create: {
      accountId: customer1Account.id,
      name: 'John Customer',
      phone: '+2348011111111',
      email: 'john@example.com',
      status: 'Active',
    },
  });

  const customer2Account = await prisma.account.upsert({
    where: { phone: '+2348022222222' },
    update: {},
    create: {
      phone: '+2348022222222',
      email: 'jane@example.com',
      isVerified: true,
      hasCustomerProfile: true,
    }
  });

  const customer2 = await prisma.customer.upsert({
    where: { accountId: customer2Account.id },
    update: {},
    create: {
      accountId: customer2Account.id,
      name: 'Jane Customer',
      phone: '+2348022222222',
      email: 'jane@example.com',
      status: 'Active',
    },
  });

  // 2. Seed Riders
  const ridersData = [
    { name: 'Rider Alpha', phone: '+2348111111111', vehicle: 'Toyota Corolla', plate: 'ABJ-123-XY', lat: 7.7969, lng: 6.7333 },
    { name: 'Rider Beta', phone: '+2348122222222', vehicle: 'Bajaj Pulsar', plate: 'LKJ-456-ZZ', lat: 7.8010, lng: 6.7400 },
    { name: 'Rider Gamma', phone: '+2348133333333', vehicle: 'Hyundai Elantra', plate: 'KGI-789-AA', lat: 7.7920, lng: 6.7280 },
    { name: 'Rider Delta', phone: '+2348144444444', vehicle: 'TVS HLX', plate: 'XYZ-000-BB', lat: 7.8100, lng: 6.7500 },
    { name: 'Rider Epsilon', phone: '+2348155555555', vehicle: 'Honda Civic', plate: 'CCC-111-DD', lat: 7.7850, lng: 6.7150 },
  ];

  const riders = [];
  for (const r of ridersData) {
    const riderAccount = await prisma.account.upsert({
      where: { phone: r.phone },
      update: {},
      create: {
        phone: r.phone,
        email: `${r.name.toLowerCase().replace(' ', '')}@example.com`,
        isVerified: true,
        hasRiderProfile: true,
      }
    });

    const rider = await prisma.rider.upsert({
      where: { accountId: riderAccount.id },
      update: { status: 'Online', latitude: r.lat, longitude: r.lng },
      create: {
        accountId: riderAccount.id,
        name: r.name,
        phone: r.phone,
        email: `${r.name.toLowerCase().replace(' ', '')}@example.com`,
        status: 'Online',
        vehicle: r.vehicle,
        plateNumber: r.plate,
        vehicleType: 'Car',
        vehicleColor: 'Silver',
        latitude: r.lat,
        longitude: r.lng,
      },
    });
    riders.push(rider);
  }

  // 3. Seed Vendors
  const vendorsData = [
    { name: 'Kogi Kitchen', phone: '+2349011111111', person: 'Chef Musa' },
    { name: 'Confluence Grills', phone: '+2349022222222', person: 'Sarah Grill' },
    { name: 'Lokoja Loaves', phone: '+2349033333333', person: 'Baker Ben' },
    { name: 'River Side Eat', phone: '+2349044444444', person: 'Alice River' },
    { name: 'Savannah Stores', phone: '+2349055555555', person: 'Ibrahim Store' },
  ];

  for (const v of vendorsData) {
    const vendorAccount = await prisma.account.upsert({
      where: { phone: v.phone },
      update: {},
      create: {
        phone: v.phone,
        email: `${v.name.toLowerCase().replace(' ', '')}@example.com`,
        isVerified: true,
        hasVendorProfile: true,
      }
    });

    await prisma.vendor.upsert({
      where: { accountId: vendorAccount.id },
      update: {},
      create: {
        accountId: vendorAccount.id,
        companyName: v.name,
        contactPerson: v.person,
        phone: v.phone,
        status: 'Active',
      },
    });
  }

  // 4. Seed Orders
  await prisma.order.create({
    data: {
      customerId: customer1.id,
      riderId: riders[0].id,
      status: 'Completed',
      type: 'Ride',
      amount: 15.50,
      pickupLocation: '123 Kogi St',
      dropoffLocation: '456 Plaza Road',
    },
  });

  await prisma.order.create({
    data: {
      customerId: customer2.id,
      status: 'Pending',
      type: 'Food',
      restaurantName: 'Kogi Kitchen',
      amount: 45.00,
      pickupLocation: 'Kogi Kitchen HQ',
      dropoffLocation: 'Green Villa 5',
    },
  });

  // 5. Seed Admin User
  const adminPassword = await bcrypt.hash('password123', 10);
  await prisma.adminUser.upsert({
    where: { email: 'admin@kogiride.com' },
    update: { password: adminPassword },
    create: {
      name: 'Super Admin',
      email: 'admin@kogiride.com',
      password: adminPassword,
      role: 'Super Admin',
      status: 'Active',
    },
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
