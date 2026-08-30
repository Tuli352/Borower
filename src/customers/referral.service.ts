import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  REFERRAL_POINTS_AWARD,
  ReferralError,
} from './referral.constants';
import {
  normalizeReferralCode,
  precheckRedemptionEligibility,
  postcheckReferrer,
  buildRedeemSuccess,
  attachReferralSummary,
} from './referral.utils';

@Injectable()
export class ReferralService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Redeem `rawCode` for `customerId`. Awards REFERRAL_POINTS_AWARD to the
   * referrer. Concurrent attempts for the same referee cannot double-award
   * because referredById is re-checked inside the transaction before write.
   */
  async redeem(
    customerId: string,
    rawCode: string | undefined | null,
  ): Promise<{ referredById: string; pointsAwarded: number }> {
    const code = normalizeReferralCode(rawCode);

    const me = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!me) {
      throw new NotFoundException('Customer not found');
    }

    const early = precheckRedemptionEligibility({
      code,
      myReferralCode: me.referralCode,
      myReferredById: me.referredById,
    });
    if (early === ReferralError.INVALID) {
      throw new BadRequestException({ error: ReferralError.INVALID });
    }
    if (early === ReferralError.NOT_ELIGIBLE) {
      throw new ConflictException({ error: ReferralError.NOT_ELIGIBLE });
    }

    const referrer = await this.prisma.customer.findUnique({
      where: { referralCode: code },
    });

    const post = postcheckReferrer({
      referrerId: referrer?.id,
      callerId: customerId,
    });
    if (post === ReferralError.NOT_FOUND) {
      throw new NotFoundException({ error: ReferralError.NOT_FOUND });
    }
    if (post === ReferralError.NOT_ELIGIBLE) {
      throw new ConflictException({ error: ReferralError.NOT_ELIGIBLE });
    }

    const referrerId = referrer!.id;
    const points = REFERRAL_POINTS_AWARD;

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({
        where: { id: customerId },
      });
      if (!current || current.referredById) {
        throw new ConflictException({ error: ReferralError.NOT_ELIGIBLE });
      }

      await tx.customer.update({
        where: { id: customerId },
        data: { referredById: referrerId },
      });

      await tx.customer.update({
        where: { id: referrerId },
        data: { totalLoyaltyPoints: { increment: points } },
      });
    });

    return buildRedeemSuccess(referrerId, points);
  }

  async loadProfileWithReferralSummary(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: 'desc' } },
        transactions: { orderBy: { createdAt: 'desc' } },
        _count: { select: { referrals: true } },
      },
    });
    if (!customer) {
      return null;
    }
    const { _count, ...rest } = customer as any;
    return attachReferralSummary(rest, _count?.referrals ?? 0);
  }
}
