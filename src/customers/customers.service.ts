import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService } from './referral.service';

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private referralService: ReferralService,
  ) {}

  findAll() {
    return this.prisma.customer.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async addSavedLocation(
    customerId: string,
    data: { name: string; address: string; latitude: number; longitude: number },
  ) {
    return this.prisma.savedLocation.create({
      data: {
        customerId,
        name: data.name,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
      },
    });
  }

  async getSavedLocations(customerId: string) {
    return this.prisma.savedLocation.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeSavedLocation(customerId: string, id: string) {
    return this.prisma.savedLocation.delete({
      where: { id, customerId },
    });
  }

  async findOne(id: string) {
    try {
      return await this.referralService.loadProfileWithReferralSummary(id);
    } catch (error: any) {
      throw new BadRequestException(`Database lookup failed: ${error.message}`);
    }
  }

  private generateReferralCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  async create(data: any, accountId?: string) {
    const { referralCode: codeUsed, phone, email, ...rest } = data;

    let effectiveAccountId = accountId;
    if (!effectiveAccountId) {
      if (!phone && !email) {
        throw new Error(
          'Either accountId, phone, or email must be provided to create a customer profile',
        );
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
            hasCustomerProfile: true,
            isVerified: true,
          },
        });
      } else {
        await this.prisma.account.update({
          where: { id: account.id },
          data: { hasCustomerProfile: true },
        });
      }
      effectiveAccountId = account.id;
    }

    const newCode = this.generateReferralCode();

    let referredById = null;
    if (codeUsed) {
      const referrer = await this.prisma.customer.findUnique({
        where: { referralCode: codeUsed },
      });
      if (referrer) {
        referredById = referrer.id;
      }
    }

    return this.prisma.customer.create({
      data: {
        ...rest,
        phone,
        email,
        account: { connect: { id: effectiveAccountId } },
        referralCode: newCode,
        referredBy: referredById ? { connect: { id: referredById } } : undefined,
      },
    });
  }

  async update(id: string, data: any) {
    try {
      return await this.prisma.customer.update({
        where: { id },
        data,
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException(
          'This email is already in use by another customer.',
        );
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Customer record not found.');
      }
      throw error;
    }
  }

  async delete(id: string) {
    try {
      return await this.prisma.customer.delete({ where: { id } });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException('Customer record not found.');
      }
      throw error;
    }
  }

  async subscribeToPlus(id: string) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    return this.prisma.customer.update({
      where: { id: id },
      data: {
        isKogiPlus: true,
        plusExpiry: expiry,
      },
    });
  }

  async getWallet(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: { walletBalance: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async getWalletTransactions(
    id: string,
    limit: number = 50,
    page: number = 1,
  ) {
    return this.prisma.transaction.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    });
  }

  /** Public entry used by the controller for POST /customers/profile/referral */
  redeemReferral(customerId: string, rawCode: string | undefined | null) {
    return this.referralService.redeem(customerId, rawCode);
  }
}
