import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Admin: CRUD Subscription Plans ────────────────────────────────────

  async createPlan(data: {
    name: string;
    description: string;
    price: number;
    durationDays?: number;
    features: string[];
  }) {
    return this.prisma.subscriptionPlan.create({
      data: {
        name: data.name,
        description: data.description,
        price: data.price,
        durationDays: data.durationDays || 30,
        features: JSON.stringify(data.features),
      },
    });
  }

  async findAllPlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
    
    const now = new Date();
    
    return Promise.all(plans.map(async (p: any) => {
      const activeCount = await this.prisma.rider.count({
        where: {
          subscriptionPlanId: p.id,
          subscriptionExpiry: { gt: now }
        }
      });
      
      let color = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      if (p.name.toLowerCase().includes('pro')) color = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      if (p.name.toLowerCase().includes('fleet')) color = 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';

      return {
        ...p,
        features: JSON.parse(p.features),
        status: p.isActive ? 'active' : 'inactive',
        color,
        activeSubscribers: activeCount
      };
    }));
  }

  async findAllSubscribers() {
    const riders = await this.prisma.rider.findMany({
      where: {
        subscriptionPlanId: { not: null }
      },
      include: {
        subscriptionPlan: true
      },
      orderBy: {
        subscriptionExpiry: 'desc'
      }
    });

    const now = new Date();

    return riders.map(r => {
      let status = 'expired';
      if (r.subscriptionExpiry && r.subscriptionExpiry > now) {
        status = 'active';
      }

      return {
        id: r.id,
        driver: r.name,
        plan: r.subscriptionPlan?.name || 'Unknown',
        amount: r.subscriptionPlan?.price || 0,
        billingCycle: 'Monthly', // Currently fixed
        nextBilling: r.subscriptionExpiry ? r.subscriptionExpiry.toISOString().split('T')[0] : '—',
        status,
        tripsCompleted: r.rides || 0,
        earnings: r.earnings || 0
      };
    });
  }

  async updatePlan(id: string, data: Partial<{ name: string; description: string; price: number; durationDays: number; features: string[]; isActive: boolean }>) {
    const updateData: any = { ...data };
    if (data.features) updateData.features = JSON.stringify(data.features);
    return this.prisma.subscriptionPlan.update({ where: { id }, data: updateData });
  }

  async deletePlan(id: string) {
    return this.prisma.subscriptionPlan.update({ where: { id }, data: { isActive: false } });
  }

  // ─── Driver: Subscribe / Renew ─────────────────────────────────────────

  async subscribeRider(riderId: string, planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new NotFoundException('Subscription plan not found');

    const rider = await this.prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw new NotFoundException('Rider not found');

    // Check wallet balance
    if (rider.walletBalance < plan.price) {
      throw new BadRequestException(
        `Insufficient wallet balance. You have ₦${rider.walletBalance.toFixed(2)} but the plan costs ₦${plan.price.toFixed(2)}.`,
      );
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + plan.durationDays);

    // Debit wallet and activate subscription in a transaction
    await this.prisma.$transaction([
      this.prisma.rider.update({
        where: { id: riderId },
        data: {
          walletBalance: { decrement: plan.price },
          subscriptionPlanId: plan.id,
          subscriptionExpiry: expiryDate,
        },
      }),
      this.prisma.transaction.create({
        data: {
          reference: `SUB-${riderId.substring(0, 8)}-${Date.now()}`,
          type: 'Subscription',
          amount: plan.price,
          status: 'Completed',
          method: 'Wallet',
          description: `Subscribed to "${plan.name}" plan`,
          riderId,
        },
      }),
    ]);

    this.logger.log(`✅ Rider ${riderId} subscribed to plan "${plan.name}" until ${expiryDate.toISOString()}`);

    return {
      success: true,
      plan: plan.name,
      expiresAt: expiryDate,
      message: `Successfully subscribed to ${plan.name}. Your plan expires on ${expiryDate.toLocaleDateString()}.`,
    };
  }

  async getRiderSubscription(riderId: string) {
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw new NotFoundException('Rider not found');

    if (!rider.subscriptionPlanId) {
      return { active: false, plan: null, expiresAt: null };
    }

    const isExpired = rider.subscriptionExpiry ? new Date() > rider.subscriptionExpiry : true;
    if (isExpired) {
      return { active: false, plan: null, expiresAt: rider.subscriptionExpiry, expired: true };
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: rider.subscriptionPlanId } });
    return {
      active: true,
      plan: plan ? { ...plan, features: JSON.parse(plan.features) } : null,
      expiresAt: rider.subscriptionExpiry,
    };
  }
}
