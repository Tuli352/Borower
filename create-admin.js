const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@kogiride.com';
  const password = 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);
  
  await prisma.adminUser.upsert({
    where: { email },
    update: { password: hashedPassword },
    create: {
      name: 'Super Admin',
      email,
      password: hashedPassword,
      role: 'Super Admin',
      status: 'Active',
    }
  });
  console.log('Successfully created/updated admin:', email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
