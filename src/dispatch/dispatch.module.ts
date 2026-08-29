import { Module, forwardRef } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { SmartDispatchService } from './smart-dispatch.service';
import { DispatchController } from './dispatch.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackingModule } from '../tracking/tracking.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [PrismaModule, TrackingModule, forwardRef(() => OrdersModule)],
  controllers: [DispatchController],
  providers: [DispatchService, SmartDispatchService],
  exports: [DispatchService, SmartDispatchService],
})
export class DispatchModule {}
