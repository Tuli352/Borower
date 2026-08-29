import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@kogiride.com';
  const password = 'password123';
  
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email }
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.adminUser.create({
      data: {
        name: 'Super Admin',
        email,
        password: hashedPassword,
        role: 'Super Admin',
        status: 'Active',
      }
    });
    console.log(`✅ Created admin user: ${email} / ${password}`);
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.adminUser.update({
      where: { email },
      data: { password: hashedPassword }
    });
    console.log(`✅ Updated existing admin user password: ${email} / ${password}`);
  }

  // Create Sample Online Riders (with proper Account → Rider relationship)
  const riders = [
    {
      name: 'Samuel Kogi',
      email: 'samuel@kogiride.com',
      phone: '08012345678',
      vehicle: 'Toyota Corolla',
      plateNumber: 'KOG-123-AB',
      latitude: 7.7969,
      longitude: 6.7405,
    },
    {
      name: 'John Driver',
      email: 'john@kogiride.com',
      phone: '08011122233',
      vehicle: 'Mercedes Benz',
      plateNumber: 'KOG-456-XY',
      latitude: 7.8012,
      longitude: 6.7350,
    },
    {
      name: 'Musa Rider',
      email: 'musa@kogiride.com',
      phone: '08033333333',
      vehicle: 'Bajaj Pulsar',
      plateNumber: 'KOG-789-CD',
      latitude: 7.7950,
      longitude: 6.7380,
    },
  ];

  for (const riderData of riders) {
    // Check if rider already exists by email
    const existingRider = await prisma.rider.findFirst({
      where: { email: riderData.email },
    });

    if (existingRider) {
      // Update existing rider to be Online with fresh coordinates
      await prisma.rider.update({
        where: { id: existingRider.id },
        data: {
          status: 'Online',
          latitude: riderData.latitude,
          longitude: riderData.longitude,
          vehicle: riderData.vehicle,
          plateNumber: riderData.plateNumber,
        },
      });
      console.log(`✅ Updated existing rider: ${riderData.name} → Online`);
      continue;
    }

    // Check if account exists by phone or email
    let account = await prisma.account.findFirst({
      where: {
        OR: [
          { phone: riderData.phone },
          { email: riderData.email },
        ],
      },
    });

    // Create account if it doesn't exist
    if (!account) {
      account = await prisma.account.create({
        data: {
          phone: riderData.phone,
          email: riderData.email,
          isVerified: true,
          hasRiderProfile: true,
        },
      });
      console.log(`  📱 Created account for ${riderData.name} (${account.id})`);
    } else {
      // Mark existing account as having rider profile
      await prisma.account.update({
        where: { id: account.id },
        data: { hasRiderProfile: true },
      });
      console.log(`  📱 Using existing account for ${riderData.name} (${account.id})`);
    }

    // Check if a rider profile already exists for this account
    const existingRiderByAccount = await prisma.rider.findUnique({
      where: { accountId: account.id },
    });

    if (existingRiderByAccount) {
      await prisma.rider.update({
        where: { id: existingRiderByAccount.id },
        data: {
          status: 'Online',
          latitude: riderData.latitude,
          longitude: riderData.longitude,
          vehicle: riderData.vehicle,
          plateNumber: riderData.plateNumber,
          name: riderData.name,
        },
      });
      console.log(`✅ Updated rider profile for ${riderData.name} → Online`);
    } else {
      // Create rider profile linked to account
      const rider = await prisma.rider.create({
        data: {
          accountId: account.id,
          name: riderData.name,
          email: riderData.email,
          phone: riderData.phone,
          vehicle: riderData.vehicle,
          plateNumber: riderData.plateNumber,
          status: 'Online',
          latitude: riderData.latitude,
          longitude: riderData.longitude,
          rating: 4.8,
        },
      });
      console.log(`✅ Created rider: ${riderData.name} (${rider.id}) → Online at [${riderData.latitude}, ${riderData.longitude}]`);
    }
  }

  // Verify: count riders
  const riderCount = await prisma.rider.count();
  const onlineCount = await prisma.rider.count({ where: { status: 'Online' } });
  console.log(`\n🏁 Database now has ${riderCount} total riders, ${onlineCount} online.`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
