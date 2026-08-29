import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { TrackingModule } from '../tracking/tracking.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [TrackingModule, MailModule, NotificationsModule, PaymentsModule],
  controllers: [SupportController],
  providers: [SupportService]
})
export class SupportModule {}
