import { Module, forwardRef } from '@nestjs/common';
import { TrackingGateway } from './tracking.gateway';
import { RidersModule } from '../riders/riders.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [forwardRef(() => RidersModule), PrismaModule],
  providers: [TrackingGateway],
  exports: [TrackingGateway],
})
export class TrackingModule {}
