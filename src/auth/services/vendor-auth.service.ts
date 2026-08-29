import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VendorAuthService {
  private readonly logger = new Logger(VendorAuthService.name);

  constructor(private prisma: PrismaService) {}

  async findOrCreateProfile(accountId: string, data: { name?: string; email?: string; phone?: string }) {
    let vendor = await this.prisma.vendor.findUnique({
      where: { accountId },
    });

    if (!vendor) {
      this.logger.log(`Creating new vendor profile for account ${accountId}`);
      vendor = await this.prisma.vendor.create({
        data: {
          account: { connect: { id: accountId } },
          companyName: data.name || 'New Vendor',
          contactPerson: 'Pending',
          email: data.email,
          phone: data.phone,
          status: 'PENDING_ONBOARDING',
          onboardingStep: 1,
        },
      });

      // Mark account as having vendor profile
      await this.prisma.account.update({
        where: { id: accountId },
        data: { hasVendorProfile: true },
      });
    }

    return vendor;
  }

  async getOnboardingStatus(accountId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { accountId },
    });

    if (!vendor) return { isComplete: false, nextStep: 'CREATE_PROFILE', step: 1 };
    
    let nextStep = 'BUSINESS_PROFILE';
    if (vendor.companyName && vendor.companyName !== 'New Vendor') {
        nextStep = 'CAC_VERIFICATION';
    }
    if (vendor.status === 'ACTIVE') {
        nextStep = 'HOME';
    }

    return {
      isComplete: vendor.status === 'ACTIVE',
      nextStep,
      step: vendor.onboardingStep,
      status: vendor.status,
    };
  }
}
