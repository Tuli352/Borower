import { Module } from '@nestjs/common';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';
import { EnhancedSafetyController } from './enhanced-safety.controller';
import { EnhancedSafetyService } from './enhanced-safety.service';
import { AnomalyService } from './anomaly.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackingModule } from '../tracking/tracking.module';
import { SmsModule } from '../sms/sms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, TrackingModule, SmsModule, NotificationsModule, MailModule],
  controllers: [SafetyController, EnhancedSafetyController],
  providers: [SafetyService, EnhancedSafetyService, AnomalyService],
  exports: [SafetyService, EnhancedSafetyService, AnomalyService],
})
export class SafetyModule {}
