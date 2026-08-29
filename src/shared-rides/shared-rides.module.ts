import { Module } from '@nestjs/common';
import { SharedRideController } from './shared-ride.controller';
import { SharedRideService } from './shared-ride.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [PrismaModule, TrackingModule],
  controllers: [SharedRideController],
  providers: [SharedRideService],
  exports: [SharedRideService],
})
export class SharedRidesModule {}
