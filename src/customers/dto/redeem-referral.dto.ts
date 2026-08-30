import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Body for POST /customers/profile/referral
 * The code is trimmed server-side; whitespace-only is rejected as invalid.
 */
export class RedeemReferralDto {
  @ApiProperty({
    description: 'Referral code belonging to another customer',
    example: 'ABC123',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;
}
