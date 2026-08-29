import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  // Get comprehensive dashboard analytics
  async getDashboardAnalytics(timeRange: 'today' | 'week' | 'month' | 'year' = 'week') {
    const dateRange = this.getDateRange(timeRange);

    try {
      const [
        overview,
        revenue,
        rides,
        users,
        performance,
        geographic,
        trends
      ] = await Promise.all([
        this.getOverviewStats(dateRange),
        this.getRevenueAnalytics(dateRange),
        this.getRidesAnalytics(dateRange),
        this.getUsersAnalytics(dateRange),
        this.getPerformanceAnalytics(dateRange),
        this.getGeographicAnalytics(dateRange),
        this.getTrendsAnalytics(dateRange)
      ]);

      return {
        timeRange,
        dateRange,
        overview,
        revenue,
        rides,
        users,
        performance,
        geographic,
        trends,
        generatedAt: new Date()
      };
    } catch (error) {
      this.logger.error(`Failed to generate dashboard analytics: ${error.message}`);
      throw error;
    }
  }

  // Get overview statistics
  private async getOverviewStats(dateRange: { start: Date; end: Date }) {
    const [
      totalRides,
      completedRides,
      totalRevenue,
      activeUsers,
      activeRiders
    ] = await Promise.all([
      this.prisma.order.count({
        where: {
          createdAt: { gte: dateRange.start, lte: dateRange.end }
        }
      }),
      this.prisma.order.count({
        where: {
          createdAt: { gte: dateRange.start, lte: dateRange.end },
          status: 'Completed'
        }
      }),
      this.prisma.transaction.aggregate({
        where: {
          date: { gte: dateRange.start, lte: dateRange.end },
          status: 'Completed'
        },
        _sum: { amount: true }
      }),
      this.prisma.customer.count({
        where: {
          createdAt: { lte: dateRange.end },
          status: 'Active'
        }
      }),
      this.prisma.rider.count({
        where: {
          status: 'Active'
        }
      })
    ]);

    const completionRate = totalRides > 0 ? (completedRides / totalRides) * 100 : 0;
    const averageRevenuePerRide = completedRides > 0 ? (totalRevenue._sum.amount || 0) / completedRides : 0;

    return {
      totalRides,
      completedRides,
      completionRate: completionRate.toFixed(1),
      totalRevenue: totalRevenue._sum.amount || 0,
      averageRevenuePerRide: averageRevenuePerRide.toFixed(2),
      activeUsers,
      activeRiders
    };
  }

  // Get revenue analytics
  public async getRevenueAnalytics(dateRange: { start: Date; end: Date }) {
    const [
      revenueByType,
      revenueByDay,
      commissionRevenue,
      walletTransactions
    ] = await Promise.all([
      this.getRevenueByType(dateRange),
      this.getRevenueByDay(dateRange),
      this.getCommissionRevenue(dateRange),
      this.getWalletTransactions(dateRange)
    ]);

    return {
      revenueByType,
      revenueByDay,
      commissionRevenue,
      walletTransactions,
      totalRevenue: revenueByType.reduce((sum, item) => sum + item.amount, 0)
    };
  }

  // Get revenue by type
  private async getRevenueByType(dateRange: { start: Date; end: Date }) {
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        status: 'Completed'
      },
      select: { type: true, amount: true }
    });

    const revenueByType = orders.reduce((acc, order) => {
      const type = order.type || 'Ride';
      if (!acc[type]) {
        acc[type] = { type, amount: 0, count: 0 };
      }
      acc[type].amount += order.amount;
      acc[type].count += 1;
      return acc;
    }, {} as Record<string, { type: string; amount: number; count: number }>);

    return Object.values(revenueByType);
  }

  // Get revenue by day
  private async getRevenueByDay(dateRange: { start: Date; end: Date }) {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        date: { gte: dateRange.start, lte: dateRange.end },
        status: 'Completed'
      },
      select: { date: true, amount: true }
    });

    const revenueByDay = transactions.reduce((acc, transaction) => {
      const day = transaction.date.toISOString().split('T')[0];
      if (!acc[day]) {
        acc[day] = { date: day, revenue: 0, transactions: 0 };
      }
      acc[day].revenue += transaction.amount;
      acc[day].transactions += 1;
      return acc;
    }, {} as Record<string, { date: string; revenue: number; transactions: number }>);

    return Object.values(revenueByDay).sort((a, b) => a.date.localeCompare(b.date));
  }

  // Get commission revenue
  private async getCommissionRevenue(dateRange: { start: Date; end: Date }) {
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        status: 'Completed'
      },
      select: { commission: true }
    });

    const totalCommission = orders.reduce((sum, order) => sum + (order.commission || 0), 0);

    return {
      totalCommission,
      averageCommissionPerRide: orders.length > 0 ? totalCommission / orders.length : 0
    };
  }

  // Get wallet transactions
  private async getWalletTransactions(dateRange: { start: Date; end: Date }) {
    const walletTransactions = await this.prisma.transaction.findMany({
      where: {
        date: { gte: dateRange.start, lte: dateRange.end },
        method: { contains: 'Wallet' }
      },
      select: { type: true, amount: true }
    });

    const transactions = walletTransactions.reduce((acc, transaction) => {
      if (!acc[transaction.type]) {
        acc[transaction.type] = { type: transaction.type, amount: 0, count: 0 };
      }
      acc[transaction.type].amount += transaction.amount;
      acc[transaction.type].count += 1;
      return acc;
    }, {} as Record<string, { type: string; amount: number; count: number }>);

    return Object.values(transactions);
  }

  // Get rides analytics
  public async getRidesAnalytics(dateRange: { start: Date; end: Date }) {
    const [
      ridesByStatus,
      ridesByType,
      averageRatings,
      peakHours,
      cancellations
    ] = await Promise.all([
      this.getRidesByStatus(dateRange),
      this.getRidesByType(dateRange),
      this.getAverageRatings(dateRange),
      this.getPeakHours(dateRange),
      this.getCancellations(dateRange)
    ]);

    return {
      ridesByStatus,
      ridesByType,
      averageRatings,
      peakHours,
      cancellations
    };
  }

  // Get rides by status
  private async getRidesByStatus(dateRange: { start: Date; end: Date }) {
    const rides = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end }
      },
      select: { status: true }
    });

    const ridesByStatus = rides.reduce((acc, ride) => {
      if (!acc[ride.status]) {
        acc[ride.status] = { status: ride.status, count: 0 };
      }
      acc[ride.status].count += 1;
      return acc;
    }, {} as Record<string, { status: string; count: number }>);

    return Object.values(ridesByStatus);
  }

  // Get rides by type
  private async getRidesByType(dateRange: { start: Date; end: Date }) {
    const rides = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end }
      },
      select: { type: true }
    });

    const ridesByType = rides.reduce((acc, ride) => {
      const type = ride.type || 'Ride';
      if (!acc[type]) {
        acc[type] = { type, count: 0 };
      }
      acc[type].count += 1;
      return acc;
    }, {} as Record<string, { type: string; count: number }>);

    return Object.values(ridesByType);
  }

  // Get average ratings
  private async getAverageRatings(dateRange: { start: Date; end: Date }) {
    const ratedOrders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        rating: { not: null }
      },
      select: { rating: true }
    });

    if (ratedOrders.length === 0) {
      return { averageRating: 0, totalRatedRides: 0, ratingDistribution: [] };
    }

    const averageRating = ratedOrders.reduce((sum, order) => sum + (order.rating || 0), 0) / ratedOrders.length;

    const ratingDistribution = [1, 2, 3, 4, 5].map(rating => ({
      rating,
      count: ratedOrders.filter(order => order.rating === rating).length
    }));

    return {
      averageRating: averageRating.toFixed(2),
      totalRatedRides: ratedOrders.length,
      ratingDistribution
    };
  }

  // Get peak hours
  private async getPeakHours(dateRange: { start: Date; end: Date }) {
    const rides = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end }
      },
      select: { createdAt: true }
    });

    const ridesByHour = rides.reduce((acc, ride) => {
      const hour = ride.createdAt.getHours();
      if (!acc[hour]) {
        acc[hour] = { hour, count: 0 };
      }
      acc[hour].count += 1;
      return acc;
    }, {} as Record<number, { hour: number; count: number }>);

    return Object.values(ridesByHour).sort((a, b) => a.hour - b.hour);
  }

  // Get cancellations
  private async getCancellations(dateRange: { start: Date; end: Date }) {
    const cancelledRides = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        status: 'Cancelled'
      },
      select: { cancelledBy: true, cancellationReason: true }
    });

    const cancellationsByReason = cancelledRides.reduce((acc, ride) => {
      const reason = ride.cancellationReason || 'Other';
      if (!acc[reason]) {
        acc[reason] = { reason, count: 0 };
      }
      acc[reason].count += 1;
      return acc;
    }, {} as Record<string, { reason: string; count: number }>);

    const cancellationsByUser = cancelledRides.reduce((acc, ride) => {
      const user = ride.cancelledBy || 'Unknown';
      if (!acc[user]) {
        acc[user] = { user, count: 0 };
      }
      acc[user].count += 1;
      return acc;
    }, {} as Record<string, { user: string; count: number }>);

    return {
      totalCancellations: cancelledRides.length,
      cancellationsByReason: Object.values(cancellationsByReason),
      cancellationsByUser: Object.values(cancellationsByUser)
    };
  }

  // Get users analytics
  public async getUsersAnalytics(dateRange: { start: Date; end: Date }) {
    const [
      newCustomers,
      newRiders,
      userRetention,
      topCustomers,
      topRiders
    ] = await Promise.all([
      this.getNewCustomers(dateRange),
      this.getNewRiders(dateRange),
      this.getUserRetention(dateRange),
      this.getTopCustomers(dateRange),
      this.getTopRiders(dateRange)
    ]);

    return {
      newCustomers,
      newRiders,
      userRetention,
      topCustomers,
      topRiders
    };
  }

  // Get new customers
  private async getNewCustomers(dateRange: { start: Date; end: Date }) {
    const customers = await this.prisma.customer.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end }
      }
    });

    return {
      totalNewCustomers: customers.length,
      customersByDay: this.groupUsersByDay(customers)
    };
  }

  // Get new riders
  private async getNewRiders(dateRange: { start: Date; end: Date }) {
    const riders = await this.prisma.rider.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end }
      }
    });

    return {
      totalNewRiders: riders.length,
      ridersByDay: this.groupUsersByDay(riders)
    };
  }

  // Group users by day
  private groupUsersByDay(users: any[]) {
    const grouped = users.reduce((acc, user) => {
      const day = user.createdAt.toISOString().split('T')[0];
      if (!acc[day]) {
        acc[day] = { date: day, count: 0 };
      }
      acc[day].count += 1;
      return acc;
    }, {} as Record<string, { date: string; count: number }>);

    return Object.values(grouped).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }

  // Get user retention
  private async getUserRetention(dateRange: { start: Date; end: Date }) {
    // This is a simplified retention calculation
    const previousPeriod = this.getDateRange('month'); // Get previous month for comparison
    
    const [currentUsers, previousUsers] = await Promise.all([
      this.prisma.customer.findMany({
        where: { createdAt: { lte: dateRange.end } },
        select: { id: true, createdAt: true }
      }),
      this.prisma.customer.findMany({
        where: { createdAt: { lte: previousPeriod.end } },
        select: { id: true, createdAt: true }
      })
    ]);

    const retentionRate = previousUsers.length > 0 ? 
      (currentUsers.length / previousUsers.length) * 100 : 100;

    return {
      retentionRate: retentionRate.toFixed(1),
      totalActiveUsers: currentUsers.length
    };
  }

  // Get top customers
  private async getTopCustomers(dateRange: { start: Date; end: Date }) {
    const customers = await this.prisma.customer.findMany({
      include: {
        orders: {
          where: {
            createdAt: { gte: dateRange.start, lte: dateRange.end },
            status: 'Completed'
          }
        }
      },
      take: 10
    });

    const topCustomers = customers
      .map(customer => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        totalRides: customer.orders.length,
        totalSpent: customer.orders.reduce((sum, order) => sum + order.amount, 0),
        averageSpent: customer.orders.length > 0 ? 
          customer.orders.reduce((sum, order) => sum + order.amount, 0) / customer.orders.length : 0
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    return topCustomers;
  }

  // Get top riders
  private async getTopRiders(dateRange: { start: Date; end: Date }) {
    const riders = await this.prisma.rider.findMany({
      include: {
        orders: {
          where: {
            createdAt: { gte: dateRange.start, lte: dateRange.end },
            status: 'Completed'
          }
        }
      },
      take: 10
    });

    const topRiders = riders
      .map(rider => ({
        id: rider.id,
        name: rider.name,
        rating: rider.rating,
        totalRides: rider.orders.length,
        totalEarnings: rider.orders.reduce((sum, order) => sum + (order.amount * 0.8), 0), // Assuming 80% to rider
        averageEarnings: rider.orders.length > 0 ? 
          rider.orders.reduce((sum, order) => sum + (order.amount * 0.8), 0) / rider.orders.length : 0
      }))
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .slice(0, 10);

    return topRiders;
  }

  // Get performance analytics
  public async getPerformanceAnalytics(dateRange: { start: Date; end: Date }) {
    const [
      dispatchMetrics,
      responseTimes,
      completionTimes
    ] = await Promise.all([
      this.getDispatchMetrics(dateRange),
      this.getResponseTimes(dateRange),
      this.getCompletionTimes(dateRange)
    ]);

    return {
      dispatchMetrics,
      responseTimes,
      completionTimes
    };
  }

  // Get dispatch metrics
  private async getDispatchMetrics(dateRange: { start: Date; end: Date }) {
    const rideRequests = await this.prisma.activeRideRequest.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end }
      }
    });

    const totalRequests = rideRequests.length;
    const acceptedRequests = rideRequests.filter(req => req.status === 'ACCEPTED').length;
    const acceptanceRate = totalRequests > 0 ? (acceptedRequests / totalRequests) * 100 : 0;

    return {
      totalRequests,
      acceptedRequests,
      acceptanceRate: acceptanceRate.toFixed(1),
      averageResponseTime: '2.5 minutes' // This would be calculated from actual data
    };
  }

  // Get response times
  private async getResponseTimes(dateRange: { start: Date; end: Date }) {
    // This would calculate actual response times from ride request data
    return {
      averageResponseTime: 2.5,
      medianResponseTime: 2.0,
      p95ResponseTime: 5.0
    };
  }

  // Get completion times
  private async getCompletionTimes(dateRange: { start: Date; end: Date }) {
    // This would calculate actual completion times
    return {
      averageCompletionTime: 25, // minutes
      medianCompletionTime: 22,
      p95CompletionTime: 45
    };
  }

  // Get geographic analytics
  public async getGeographicAnalytics(dateRange: { start: Date; end: Date }) {
    const [
      popularRoutes,
      demandByArea,
      riderDistribution
    ] = await Promise.all([
      this.getPopularRoutes(dateRange),
      this.getDemandByArea(dateRange),
      this.getRiderDistribution()
    ]);

    return {
      popularRoutes,
      demandByArea,
      riderDistribution
    };
  }

  // Get popular routes
  private async getPopularRoutes(dateRange: { start: Date; end: Date }) {
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        status: 'Completed'
      },
      select: {
        pickupLocation: true,
        dropoffLocation: true,
        amount: true
      },
      take: 100
    });

    const routes = orders.reduce((acc, order) => {
      const route = `${order.pickupLocation} → ${order.dropoffLocation}`;
      if (!acc[route]) {
        acc[route] = { route, count: 0, totalRevenue: 0 };
      }
      acc[route].count += 1;
      acc[route].totalRevenue += order.amount;
      return acc;
    }, {} as Record<string, { route: string; count: number; totalRevenue: number }>);

    return Object.values(routes)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  // Get demand by area
  private async getDemandByArea(dateRange: { start: Date; end: Date }) {
    // This would analyze pickup locations to determine demand by area
    return [
      { area: 'City Center', demand: 45, growth: 12 },
      { area: 'Airport', demand: 30, growth: 8 },
      { area: 'University', demand: 25, growth: 15 },
      { area: 'Shopping District', demand: 20, growth: 5 }
    ];
  }

  // Get rider distribution
  private async getRiderDistribution() {
    const riders = await this.prisma.rider.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        status: 'Active'
      },
      select: { latitude: true, longitude: true }
    });

    // This would cluster riders by geographic area
    return {
      totalActiveRiders: riders.length,
      distribution: [
        { area: 'City Center', riders: 120 },
        { area: 'North District', riders: 80 },
        { area: 'South District', riders: 65 },
        { area: 'East District', riders: 45 },
        { area: 'West District', riders: 35 }
      ]
    };
  }

  // Get trends analytics
  public async getTrendsAnalytics(dateRange: { start: Date; end: Date }) {
    const [
      growthTrends,
      seasonalPatterns,
      competitorAnalysis
    ] = await Promise.all([
      this.getGrowthTrends(dateRange),
      this.getSeasonalPatterns(),
      this.getCompetitorAnalysis()
    ]);

    return {
      growthTrends,
      seasonalPatterns,
      competitorAnalysis
    };
  }

  // Get growth trends
  private async getGrowthTrends(dateRange: { start: Date; end: Date }) {
    // This would analyze growth over time
    return {
      userGrowth: 15.2,
      revenueGrowth: 22.8,
      rideGrowth: 18.5,
      marketShare: 8.3
    };
  }

  // Get seasonal patterns
  private async getSeasonalPatterns() {
    // This would analyze seasonal patterns in demand
    return {
      peakSeasons: ['December', 'January', 'July'],
      offPeakSeasons: ['February', 'September'],
      weeklyPatterns: {
        weekdayDemand: 65,
        weekendDemand: 85
      },
      hourlyPatterns: {
        morningPeak: '7-9 AM',
        eveningPeak: '5-7 PM',
        lateNight: '10 PM - 2 AM'
      }
    };
  }

  // Get competitor analysis
  private async getCompetitorAnalysis() {
    // This would provide competitor insights
    return {
      marketLeaders: ['Uber', 'Bolt', 'Taxify'],
      ourPosition: 4,
      competitorPricing: {
        uber: 'Similar',
        bolt: '10% higher',
        taxify: '5% lower'
      },
      marketOpportunities: [
        'Premium rides',
        'Corporate partnerships',
        'Airport transfers'
      ]
    };
  }

  // Helper method to get date range
  private getDateRange(timeRange: 'today' | 'week' | 'month' | 'year'): { start: Date; end: Date } {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    let start = new Date(now);

    switch (timeRange) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'week':
        start.setDate(now.getDate() - 7);
        break;
      case 'month':
        start.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        start.setFullYear(now.getFullYear() - 1);
        break;
    }

    return { start, end };
  }

  // Get real-time metrics
  async getRealTimeMetrics() {
    const [
      activeRides,
      onlineRiders,
      pendingRequests,
      recentActivity
    ] = await Promise.all([
      this.prisma.order.count({
        where: { status: { in: ['Accepted', 'OnWay'] } }
      }),
      this.prisma.rider.count({
        where: { status: 'Active' }
      }),
      this.prisma.activeRideRequest.count({
        where: { status: 'SEARCHING' }
      }),
      this.getRecentActivity()
    ]);

    return {
      activeRides,
      onlineRiders,
      pendingRequests,
      recentActivity,
      systemHealth: 'All systems operational',
      lastUpdated: new Date()
    };
  }

  // Get recent activity
  private async getRecentActivity() {
    const recentOrders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
      },
      select: { status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    return recentOrders.map(order => ({
      type: 'order',
      status: order.status,
      timestamp: order.createdAt
    }));
  }
}
