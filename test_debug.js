const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  // 1. Check riders
  const riders = await prisma.rider.findMany({ select: { id: true, name: true, status: true, latitude: true, longitude: true } });
  console.log('\n=== RIDERS ===');
  riders.forEach(r => console.log(`  ${r.name} | status=${r.status} | lat=${r.latitude} lng=${r.longitude}`));

  // 2. Check customers
  const customers = await prisma.customer.findMany({ select: { id: true, name: true, phone: true } });
  console.log('\n=== CUSTOMERS ===');
  customers.forEach(c => console.log(`  ${c.name} | phone=${c.phone}`));

  // 3. Check recent orders
  const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, status: true, type: true, riderId: true, customerId: true, createdAt: true, pickupLocation: true } });
  console.log('\n=== RECENT ORDERS (last 5) ===');
  orders.forEach(o => console.log(`  ${o.id.substring(0,8)} | status=${o.status} | type=${o.type} | rider=${o.riderId?.substring(0,8) || 'none'} | customer=${o.customerId?.substring(0,8)} | ${o.pickupLocation}`));

  // 4. Check active ride requests
  const activeReqs = await prisma.activeRideRequest.findMany({ select: { id: true, orderId: true, status: true, currentRiderId: true } });
  console.log('\n=== ACTIVE RIDE REQUESTS ===');
  if (activeReqs.length === 0) console.log('  (none)');
  activeReqs.forEach(r => console.log(`  order=${r.orderId.substring(0,8)} | status=${r.status} | rider=${r.currentRiderId?.substring(0,8) || 'none'}`));

  // 5. Check users (auth accounts)
  const users = await prisma.user.findMany({ select: { id: true, email: true, appType: true, profileId: true } });
  console.log('\n=== USERS (auth) ===');
  users.forEach(u => console.log(`  ${u.email} | appType=${u.appType} | profileId=${u.profileId?.substring(0,8)}`));

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
