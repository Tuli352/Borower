import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RiderAuthService {
  private readonly logger = new Logger(RiderAuthService.name);

  constructor(private prisma: PrismaService) {}

  async findOrCreateProfile(accountId: string, data: { name?: string; email?: string; phone?: string }) {
    let rider = await this.prisma.rider.findUnique({
      where: { accountId },
    });

    if (!rider) {
      this.logger.log(`Creating new rider profile for account ${accountId}`);
      rider = await this.prisma.rider.create({
        data: {
          account: { connect: { id: accountId } },
          name: data.name || 'New Rider',
          email: data.email,
          phone: data.phone,
          status: 'PENDING_ONBOARDING',
          onboardingStep: 1,
        },
      });

      // Mark account as having rider profile
      await this.prisma.account.update({
        where: { id: accountId },
        data: { hasRiderProfile: true },
      });
    }

    return rider;
  }

  async getOnboardingStatus(accountId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { accountId },
      include: { documents: true },
    });

    if (!rider) return { isComplete: false, nextStep: 'CREATE_PROFILE', step: 1 };
    
    // Steps: 1: Profile, 2: Vehicle, 3: KYC Documents, 4: Admin Review
    if (rider.onboardingStep === 1 && rider.name !== 'New Rider') {
        // Assume step 1 complete if name updated
    }

    let nextStep = 'COMPLETE_PROFILE';
    if (rider.name && rider.name !== 'New Rider') {
        nextStep = 'VEHICLE_DETAILS';
    }
    if (rider.vehicle && rider.plateNumber) {
        nextStep = 'KYC_DOCUMENTS';
    }
    if (rider.documents.length > 0) {
        nextStep = 'WAITING_FOR_APPROVAL';
    }
    if (rider.status === 'ACTIVE') {
        nextStep = 'HOME';
    }

    return {
      isComplete: rider.status === 'ACTIVE',
      nextStep,
      step: rider.onboardingStep,
      status: rider.status,
    };
  }
}
