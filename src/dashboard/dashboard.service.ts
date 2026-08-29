import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      totalOrders, 
      activeRiders, 
      allCompletedOrders,
      recentOrders,
      sevenDayOrders
    ] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.rider.count({ where: { status: 'Active' } }),
      this.prisma.order.findMany({ where: { status: 'Completed' } }),
      this.prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { customer: true }
      }),
      this.prisma.order.findMany({
        where: { 
          status: 'Completed',
          createdAt: { gte: sevenDaysAgo } 
        },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    // Calculate Financials
    const totalGrossRevenue = allCompletedOrders.reduce((sum, o) => sum + o.amount, 0);
    const platformCommissionRate = 0.15;
    const platformEarnings = totalGrossRevenue * platformCommissionRate;
    const totalPayouts = totalGrossRevenue * (1 - platformCommissionRate);

    const todayOrders = allCompletedOrders.filter(o => new Date(o.createdAt) >= today);
    const revenueToday = todayOrders.reduce((sum, o) => sum + o.amount, 0);

    // Generate 7-Day Trend Data
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const revenueMap = new Map();
    
    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dayName = days[d.getDay()];
      revenueMap.set(dayName, 0);
    }

    // Populate with real data
    sevenDayOrders.forEach(order => {
      const dayName = days[new Date(order.createdAt).getDay()];
      if (revenueMap.has(dayName)) {
        revenueMap.set(dayName, (revenueMap.get(dayName) || 0) + order.amount);
      }
    });

    const revenueData = Array.from(revenueMap.entries()).map(([name, revenue]) => ({
      name,
      revenue
    }));

    // Calculate Trends (Mocked for now as we'd need historical comparison)
    // In a full implementation, we'd compare this week vs last week
    const ordersTrend = { value: 12.5, isPositive: true };
    const revenueTrend = { value: 8.2, isPositive: true };

    return {
      stats: {
        totalOrders: totalOrders.toString(),
        ordersTrend,
        totalRevenue: totalGrossRevenue,
        revenueToday: revenueToday,
        revenueTrend,
        platformEarnings,
        totalPayouts,
        activeRiders: activeRiders.toString(),
      },
      revenueData,
      recentOrders: recentOrders.map(order => ({
        id: order.id.slice(0, 8).toUpperCase(),
        customer: order.customer?.name || 'Guest',
        status: order.status,
        amount: order.amount
      })),
      riderActivity: [] // Optional: Can be populated from tracking logs
    };
  }
}
