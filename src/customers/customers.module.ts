import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { ReferralService } from './referral.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, ReferralService],
  exports: [CustomersService, ReferralService],
})
export class CustomersModule {}
