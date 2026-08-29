import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.vendor.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
        menuCategories: {
           include: { items: true }
        }
      },
    });

    if (vendor) {
      // Find orders where restaurantName matches companyName
      const orders = await this.prisma.order.findMany({
        where: { restaurantName: vendor.companyName },
        orderBy: { createdAt: 'desc' },
      });
      return { ...vendor, orders };
    }

    return null;
  }

  async findNearby(lat?: number, lng?: number, category?: string) {
    // Current Prisma schema for Vendor does not include latitude/longitude coordinates.
    // Returning all active vendors and mocking expected distance/delivery data for frontend testing.
    const vendors = await this.prisma.vendor.findMany({
      where: { status: 'Active' },
    });

    return vendors.map(v => ({
      id: v.id,
      businessName: v.companyName,
      avatar: v.avatar,
      rating: 4.5, // Mock data since it's not in schema
      estimatedDeliveryTime: '30-45 mins',
      // Coordinates would be populated here if schema is updated
    }));
  }

  private generateReferralCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  async create(data: any, accountId?: string) {
    const { businessName, ownerName, phone, email, referralCode: codeUsed, ...rest } = data;
    
    // 1. Resolve or Create Account if not provided
    let effectiveAccountId = accountId;
    if (!effectiveAccountId) {
      if (!phone && !email) {
        throw new Error('Either accountId, phone, or email must be provided to create a vendor profile');
      }

      let account = await this.prisma.account.findFirst({
        where: {
          OR: [
            ...(phone ? [{ phone }] : []),
            ...(email ? [{ email }] : []),
          ],
        },
      });

      if (!account) {
        account = await this.prisma.account.create({
          data: {
            phone,
            email,
            hasVendorProfile: true,
            isVerified: true,
          },
        });
      } else {
        await this.prisma.account.update({
          where: { id: account.id },
          data: { hasVendorProfile: true },
        });
      }
      effectiveAccountId = account.id;
    }

    // 2. Generate unique code for the new user
    let newCode = this.generateReferralCode();
    
    // 3. Handle referrer if provided
    let referredById = null;
    if (codeUsed) {
      const referrer = await this.prisma.vendor.findUnique({ where: { referralCode: codeUsed } });
      if (referrer) {
        referredById = referrer.id;
      }
    }

    const formattedData: any = {
      ...rest,
      phone,
      email,
      account: { connect: { id: effectiveAccountId } },
      companyName: businessName || data.companyName,
      contactPerson: ownerName || data.contactPerson,
      referralCode: newCode,
      referredBy: referredById ? { connect: { id: referredById } } : undefined
    };
    
    // Safety: Remove any potential undefined aliases
    delete formattedData.businessName;
    delete formattedData.ownerName;

    return this.prisma.vendor.create({ data: formattedData });
  }

  update(id: string, data: any) {
    const { businessName, ownerName, companyName, contactPerson, ...rest } = data;

    const formattedData: any = {
      ...rest,
      companyName: businessName !== undefined ? businessName : companyName,
      contactPerson: ownerName !== undefined ? ownerName : contactPerson,
    };

    // Explicitly remove unknown fields if they survived the rest spread
    delete (formattedData as any).businessName;
    delete (formattedData as any).ownerName;

    return this.prisma.vendor.update({
      where: { id },
      data: formattedData,
    });
  }

  delete(id: string) {
    return this.prisma.vendor.delete({ where: { id } });
  }
}
