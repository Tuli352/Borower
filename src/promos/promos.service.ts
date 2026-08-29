import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PromosService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: any) {
    return this.prisma.promoCode.create({
      data: {
        code: data.code.toUpperCase(),
        discountPercent: data.discountPercent ? parseFloat(data.discountPercent) : null,
        flatDiscount: data.flatDiscount ? parseFloat(data.flatDiscount) : null,
        maxUses: data.maxUses ? parseInt(data.maxUses) : null,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        isActive: true,
      },
    });
  }

  async update(id: string, data: any) {
    const updateData: any = {};
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.code) updateData.code = data.code.toUpperCase();
    
    return this.prisma.promoCode.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string) {
    return this.prisma.promoCode.delete({
      where: { id },
    });
  }

  async getReferralStats() {
    const [customerReferrals, riderReferrals, vendorReferrals] = await Promise.all([
      this.prisma.customer.count({ where: { referredById: { not: null } } }),
      this.prisma.rider.count({ where: { referredById: { not: null } } }),
      this.prisma.vendor.count({ where: { referredById: { not: null } } }),
    ]);

    // Get top referrers
    const topCustomers = await this.prisma.customer.findMany({
      where: { referrals: { some: {} } },
      include: { _count: { select: { referrals: true } } },
      orderBy: { referrals: { _count: 'desc' } },
      take: 5,
    });

    return {
      totalReferrals: customerReferrals + riderReferrals + vendorReferrals,
      byRole: {
        customers: customerReferrals,
        riders: riderReferrals,
        vendors: vendorReferrals,
      },
      topReferrers: topCustomers.map(c => ({
        name: c.name,
        count: c._count.referrals,
        code: c.referralCode
      }))
    };
  }
}
