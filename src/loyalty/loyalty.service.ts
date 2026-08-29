import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private trackingGateway: TrackingGateway,
  ) {}

  // Get user's loyalty profile
  async getLoyaltyProfile(userId: string, userType: 'customer' | 'rider') {
    try {
      if (userType === 'customer') {
        const customer = await this.prisma.customer.findUnique({
          where: { id: userId },
          include: {
            loyaltyPoints: true,
            loyaltyRedemptions: true
          }
        });

        if (!customer) {
          throw new NotFoundException('Customer not found');
        }

        return this.formatLoyaltyProfile(customer, 'customer');
      } else {
        const rider = await this.prisma.rider.findUnique({
          where: { id: userId },
          include: {
            loyaltyPoints: true,
          }
        });

        if (!rider) {
          throw new NotFoundException('Rider not found');
        }

        return this.formatLoyaltyProfile(rider, 'rider');
      }
    } catch (error) {
      this.logger.error(`Failed to get loyalty profile: ${error.message}`);
      throw error;
    }
  }

  // Award points for activity
  async awardPoints(data: {
    userId: string;
    userType: 'customer' | 'rider';
    activity: string;
    points: number;
    description?: string;
    referenceId?: string;
  }) {
    try {
      // Create loyalty points record
      const points = Number(data.points) || 0;
      const activity = data.activity || 'bonus';

      const loyaltyPoints = await (this.prisma as any).loyaltyPoints.create({
        data: {
          userId: data.userId,
          userType: data.userType,
          activity: activity,
          points: points,
          description: data.description || `Points earned for ${activity.replace('_', ' ')}`,
          referenceId: data.referenceId,
          createdAt: new Date()
        }
      });

      // Update user's total points
      await this.updateUserTotalPoints(data.userId, data.userType, data.points);

      // Check for tier upgrade
      await this.checkTierUpgrade(data.userId, data.userType);

      // Send notification
      await this.sendPointsNotification(data.userId, data.userType, data.points, data.activity);

      this.logger.log(`Awarded ${data.points} points to ${data.userType} ${data.userId} for ${data.activity}`);

      return {
        success: true,
        points: loyaltyPoints,
        message: `You earned ${data.points} points!`
      };
    } catch (error) {
      this.logger.error(`Failed to award points: ${error.message}`);
      throw error;
    }
  }

  // Redeem rewards
  async redeemReward(userId: string, userType: 'customer' | 'rider', rewardId: string) {
    try {
      // Get user's current points
      const user = await this.getUserWithPoints(userId, userType);
      const currentPoints = user.totalLoyaltyPoints || 0;

      // Get reward details
      const reward = await (this.prisma as any).loyaltyReward.findUnique({
        where: { id: rewardId }
      });

      if (!reward) {
        throw new NotFoundException('Reward not found');
      }

      if (reward.pointsCost > currentPoints) {
        throw new BadRequestException(`Insufficient points. You need ${reward.pointsCost} points but have ${currentPoints}`);
      }

      // Check if reward is available
      if (!reward.isActive || reward.stock <= 0) {
        throw new BadRequestException('Reward is not available');
      }

      // Create redemption record
      const redemption = await (this.prisma as any).loyaltyRedemption.create({
        data: {
          userId,
          userType,
          rewardId,
          pointsUsed: reward.pointsCost,
          status: 'completed',
          redeemedAt: new Date()
        }
      });

      // Deduct points from user
      await this.updateUserTotalPoints(userId, userType, -reward.pointsCost);

      // Update reward stock
      await this.prisma.loyaltyReward.update({
        where: { id: rewardId },
        data: {
          stock: { decrement: 1 },
          timesRedeemed: { increment: 1 }
        }
      });

      // Send notification
      await this.sendRedemptionNotification(userId, userType, this.parseReward(reward));

      this.logger.log(`${userType} ${userId} redeemed reward ${rewardId}`);

      return {
        success: true,
        redemption,
        reward: this.parseReward(reward),
        remainingPoints: currentPoints - reward.pointsCost,
        message: `Successfully redeemed ${reward.name}!`
      };
    } catch (error) {
      this.logger.error(`Failed to redeem reward: ${error.message}`);
      throw error;
    }
  }

  // Get available rewards
  async getAvailableRewards(userType: 'customer' | 'rider', userPoints?: number) {
    const rewards = await (this.prisma as any).loyaltyReward.findMany({
      where: {
        isActive: true,
        stock: { gt: 0 },
        applicableTo: { contains: userType }
      },
      orderBy: { pointsCost: 'asc' }
    });

    return rewards.map((reward: any) => ({
      ...this.parseReward(reward),
      canAfford: userPoints ? userPoints >= reward.pointsCost : false
    }));
  }

  // Get user's redemption history
  async getRedemptionHistory(userId: string, userType: 'customer' | 'rider') {
    const redemptions = await (this.prisma as any).loyaltyRedemption.findMany({
      where: { userId, userType },
      include: {
        reward: true
      },
      orderBy: { redeemedAt: 'desc' }
    });

    return redemptions.map((r: any) => ({
      ...r,
      reward: this.parseReward(r.reward)
    }));
  }

  // Get user's points history
  async getPointsHistory(userId: string, userType: 'customer' | 'rider') {
    return await (this.prisma as any).loyaltyPoints.findMany({
      where: { userId, userType },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  }

  // Process ride completion for points
  async processRideCompletion(orderId: string) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { customer: true, rider: true }
      });

      if (!order || order.status !== 'Completed') {
        return;
      }

      // Award points to customer
      if (order.customerId) {
        const customerPoints = Math.floor(order.amount * 0.1); // 10% of fare as points
        await this.awardPoints({
          userId: order.customerId,
          userType: 'customer',
          activity: 'ride_completion',
          points: customerPoints,
          description: `Points earned for completing ride ${orderId}`,
          referenceId: orderId
        });
      }

      // Award points to rider
      if (order.riderId) {
        const riderPoints = Math.floor(order.amount * 0.05); // 5% of fare as points
        await this.awardPoints({
          userId: order.riderId,
          userType: 'rider',
          activity: 'ride_completion',
          points: riderPoints,
          description: `Points earned for completing ride ${orderId}`,
          referenceId: orderId
        });
      }

      // Bonus points for high ratings
      if (order.rating && order.rating >= 5) {
        if (order.customerId) {
          await this.awardPoints({
            userId: order.customerId,
            userType: 'customer',
            activity: 'excellent_rating',
            points: 50,
            description: 'Bonus points for excellent rating',
            referenceId: orderId
          });
        }

        if (order.riderId) {
          await this.awardPoints({
            userId: order.riderId,
            userType: 'rider',
            activity: 'excellent_rating',
            points: 100,
            description: 'Bonus points for excellent rating',
            referenceId: orderId
          });
        }
      }

    } catch (error) {
      this.logger.error(`Failed to process ride completion points: ${error.message}`);
    }
  }

  // Process referral rewards
  async processReferralReward(referrerId: string, referredId: string, userType: 'customer' | 'rider') {
    try {
      // Check if this is a first-time user
      const user = await this.getUserWithPoints(referredId, userType);
      const isFirstTime = user.totalLoyaltyPoints === 0;

      if (isFirstTime) {
        // Award bonus points to referrer
        await this.awardPoints({
          userId: referrerId,
          userType,
          activity: 'successful_referral',
          points: 500,
          description: 'Bonus points for successful referral',
          referenceId: referredId
        });

        // Award welcome points to new user
        await this.awardPoints({
          userId: referredId,
          userType,
          activity: 'welcome_bonus',
          points: 200,
          description: 'Welcome bonus points',
          referenceId: referrerId
        });
      }
    } catch (error) {
      this.logger.error(`Failed to process referral reward: ${error.message}`);
    }
  }

  // Create new reward (admin)
  async createReward(data: {
    name: string;
    description: string;
    pointsCost: number;
    category: string;
    applicableTo: string[];
    stock: number;
    imageUrl?: string;
    terms?: string;
  }) {
    try {
      const reward = await (this.prisma as any).loyaltyReward.create({
        data: {
          ...data,
          applicableTo: JSON.stringify(data.applicableTo),
          isActive: true,
          timesRedeemed: 0,
          createdAt: new Date()
        }
      });

      this.logger.log(`Created new reward: ${reward.name}`);

      return { success: true, reward: this.parseReward(reward) };
    } catch (error) {
      this.logger.error(`Failed to create reward: ${error.message}`);
      throw error;
    }
  }

  // Get loyalty statistics (admin)
  async getLoyaltyStatistics() {
    try {
      const [
        totalCustomers,
        totalRiders,
        totalPointsIssued,
        totalPointsRedeemed,
        activeRewards,
        topCustomers,
        topRiders,
        redemptionStats
      ] = await Promise.all([
        this.prisma.customer.count(),
        this.prisma.rider.count(),
        this.getTotalPointsIssued(),
        this.getTotalPointsRedeemed(),
        this.prisma.loyaltyReward.count({ where: { isActive: true } }),
        this.getTopCustomersByPoints(),
        this.getTopRidersByPoints(),
        this.getRedemptionStatistics()
      ]);

      return {
        totalCustomers,
        totalRiders,
        totalPointsIssued,
        totalPointsRedeemed,
        netPointsInCirculation: totalPointsIssued - totalPointsRedeemed,
        activeRewards,
        topCustomers,
        topRiders,
        redemptionStats
      };
    } catch (error) {
      this.logger.error(`Failed to get loyalty statistics: ${error.message}`);
      throw error;
    }
  }

  // Helper methods
  private formatLoyaltyProfile(user: any, userType: string) {
    const totalPoints = user.totalLoyaltyPoints || 0;
    const tier = this.calculateTier(totalPoints);
    const nextTier = this.getNextTier(tier);
    const pointsToNextTier = nextTier ? nextTier.requiredPoints - totalPoints : 0;
    const progress = nextTier ? ((totalPoints - tier.requiredPoints) / (nextTier.requiredPoints - tier.requiredPoints)) * 100 : 100;

    return {
      userId: user.id,
      userType,
      totalPoints,
      tier,
      nextTier,
      pointsToNextTier,
      tierProgress: Math.min(progress, 100),
      benefits: tier.benefits,
      recentPoints: user.loyaltyPoints?.slice(0, 5) || [],
      recentRedemptions: user.loyaltyRedemptions?.slice(0, 5) || []
    };
  }

  private calculateTier(points: number) {
    const tiers = [
      { name: 'Bronze', requiredPoints: 0, benefits: ['Basic ride discounts', 'Birthday bonus'] },
      { name: 'Silver', requiredPoints: 1000, benefits: ['Enhanced discounts', 'Priority support', 'Free ride upgrades'] },
      { name: 'Gold', requiredPoints: 5000, benefits: ['Premium discounts', 'VIP support', 'Exclusive rewards', 'Airport lounge access'] },
      { name: 'Platinum', requiredPoints: 15000, benefits: ['Maximum discounts', 'Concierge service', 'Exclusive events', 'Partner benefits'] }
    ];

    for (let i = tiers.length - 1; i >= 0; i--) {
      if (points >= tiers[i].requiredPoints) {
        return tiers[i];
      }
    }

    return tiers[0];
  }

  private getNextTier(currentTier: any) {
    const tiers = [
      { name: 'Bronze', requiredPoints: 0 },
      { name: 'Silver', requiredPoints: 1000 },
      { name: 'Gold', requiredPoints: 5000 },
      { name: 'Platinum', requiredPoints: 15000 }
    ];

    const currentIndex = tiers.findIndex(t => t.name === currentTier.name);
    return currentIndex < tiers.length - 1 ? tiers[currentIndex + 1] : null;
  }

  private async updateUserTotalPoints(userId: string, userType: string, points: number) {
    const model = userType === 'customer' ? this.prisma.customer : this.prisma.rider;
    await (model as any).update({
      where: { id: userId },
      data: {
        totalLoyaltyPoints: { increment: points }
      }
    });
  }

  private async checkTierUpgrade(userId: string, userType: string) {
    const user = await this.getUserWithPoints(userId, userType);
    const currentTier = this.calculateTier(user.totalLoyaltyPoints || 0);
    
    // This would check if user upgraded and send appropriate notifications
    // Implementation would depend on storing current tier in user profile
  }

  private async getUserWithPoints(userId: string, userType: string) {
    const model = userType === 'customer' ? this.prisma.customer : this.prisma.rider;
    return await (model as any).findUnique({
      where: { id: userId },
      select: { id: true, totalLoyaltyPoints: true }
    });
  }

  private async sendPointsNotification(userId: string, userType: string, points: number, activity: string) {
    const notification = await this.notificationsService.create({
      title: 'Loyalty Points Earned!',
      message: `You earned ${points} points for ${activity.replace('_', ' ')}!`,
      type: 'LOYALTY_POINTS',
    });

    const socketEvent = userType === 'customer' ? `customer_notification_${userId}` : `rider_notification_${userId}`;
    this.trackingGateway.server.emit(socketEvent, notification);
  }

  private async sendRedemptionNotification(userId: string, userType: string, reward: any) {
    const notification = await this.notificationsService.create({
      title: 'Reward Redeemed!',
      message: `Successfully redeemed ${reward.name}. Check your email for details.`,
      type: 'LOYALTY_REDEMPTION',
    });

    const socketEvent = userType === 'customer' ? `customer_notification_${userId}` : `rider_notification_${userId}`;
    this.trackingGateway.server.emit(socketEvent, notification);
  }

  private async getTotalPointsIssued() {
    const result = await (this.prisma as any).loyaltyPoints.aggregate({
      where: { points: { gt: 0 } },
      _sum: { points: true }
    });
    return result._sum.points || 0;
  }

  private async getTotalPointsRedeemed() {
    const result = await (this.prisma as any).loyaltyRedemption.aggregate({
      _sum: { pointsUsed: true }
    });
    return result._sum.pointsUsed || 0;
  }

  private async getTopCustomersByPoints() {
    return await (this.prisma as any).customer.findMany({
      where: { totalLoyaltyPoints: { gt: 0 } },
      select: { id: true, name: true, totalLoyaltyPoints: true },
      orderBy: { totalLoyaltyPoints: 'desc' },
      take: 10
    });
  }

  private async getTopRidersByPoints() {
    return await (this.prisma as any).rider.findMany({
      where: { totalLoyaltyPoints: { gt: 0 } },
      select: { id: true, name: true, totalLoyaltyPoints: true },
      orderBy: { totalLoyaltyPoints: 'desc' },
      take: 10
    });
  }

  private async getRedemptionStatistics() {
    const redemptions = await (this.prisma as any).loyaltyRedemption.findMany({
      include: { reward: true }
    });

    const byCategory = redemptions.reduce((acc: any, redemption: any) => {
      const category = redemption.reward.category;
      if (!acc[category]) {
        acc[category] = { category, count: 0, pointsUsed: 0 };
      }
      acc[category].count += 1;
      acc[category].pointsUsed += redemption.pointsUsed;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(byCategory);
  }

  private parseReward(reward: any) {
    if (!reward) return null;
    try {
      return {
        ...reward,
        applicableTo: typeof reward.applicableTo === 'string' 
          ? JSON.parse(reward.applicableTo) 
          : reward.applicableTo
      };
    } catch (e) {
      return {
        ...reward,
        applicableTo: [reward.applicableTo]
      };
    }
  }
}
