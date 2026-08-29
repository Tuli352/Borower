import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(private prisma: PrismaService) {}

  async findOrCreateProfile(accountId: string, data: { name?: string; email?: string; phone?: string }) {
    let customer = await this.prisma.customer.findUnique({
      where: { accountId },
    });

    if (!customer) {
      this.logger.log(`Creating new customer profile for account ${accountId}`);
      customer = await this.prisma.customer.create({
        data: {
          account: { connect: { id: accountId } },
          name: data.name || 'New Customer',
          email: data.email,
          phone: data.phone,
          status: 'Active',
        },
      });

      // Mark account as having customer profile
      await this.prisma.account.update({
        where: { id: accountId },
        data: { hasCustomerProfile: true },
      });
    }

    return customer;
  }

  async getOnboardingStatus(accountId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { accountId },
    });

    if (!customer) return { isComplete: false, nextStep: 'CREATE_PROFILE' };
    
    const isComplete = !!customer.name && !!customer.email;
    return {
      isComplete,
      nextStep: isComplete ? 'HOME' : 'COMPLETE_PROFILE',
    };
  }
}
