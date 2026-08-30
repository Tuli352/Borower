/**
 * Fixed loyalty-point bonus granted to the referrer when a code is redeemed.
 */
export const REFERRAL_POINTS_AWARD = 100;

/**
 * Stable error codes returned in JSON bodies for referral redemption failures.
 */
export const ReferralError = {
  INVALID: 'invalid_referral_code',
  NOT_FOUND: 'referral_not_found',
  NOT_ELIGIBLE: 'referral_not_eligible',
} as const;

export type ReferralErrorCode =
  (typeof ReferralError)[keyof typeof ReferralError];
