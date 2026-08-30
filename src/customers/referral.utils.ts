import { ReferralError, ReferralErrorCode } from './referral.constants';

export function normalizeReferralCode(
  raw: string | undefined | null,
): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.trim();
}

export function precheckRedemptionEligibility(args: {
  code: string;
  myReferralCode: string | null | undefined;
  myReferredById: string | null | undefined;
}): ReferralErrorCode | null {
  const { code, myReferralCode, myReferredById } = args;
  if (!code) {
    return ReferralError.INVALID;
  }
  if (myReferredById) {
    return ReferralError.NOT_ELIGIBLE;
  }
  if (myReferralCode && myReferralCode === code) {
    return ReferralError.NOT_ELIGIBLE;
  }
  return null;
}

export function postcheckReferrer(args: {
  referrerId: string | undefined | null;
  callerId: string;
}): ReferralErrorCode | null {
  if (!args.referrerId) {
    return ReferralError.NOT_FOUND;
  }
  if (args.referrerId === args.callerId) {
    return ReferralError.NOT_ELIGIBLE;
  }
  return null;
}

export function buildRedeemSuccess(
  referredById: string,
  pointsAwarded: number,
): { referredById: string; pointsAwarded: number } {
  return { referredById, pointsAwarded };
}

export function attachReferralSummary<T extends Record<string, unknown>>(
  customer: T,
  referralCount: number,
): T & { referralCount: number; totalLoyaltyPoints: number } {
  const points =
    typeof (customer as any).totalLoyaltyPoints === 'number'
      ? (customer as any).totalLoyaltyPoints
      : 0;
  return {
    ...customer,
    referralCount,
    totalLoyaltyPoints: points,
  };
}
