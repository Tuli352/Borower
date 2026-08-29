import { Module } from '@nestjs/common';
import { RidersController } from './riders.controller';
import { RidersService } from './riders.service';
import { DocumentsService } from './documents.service';
import { TrackingModule } from '../tracking/tracking.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TrackingModule, NotificationsModule],
  controllers: [RidersController],
  providers: [RidersService, DocumentsService],
  exports: [RidersService, DocumentsService]
})
export class RidersModule {}
