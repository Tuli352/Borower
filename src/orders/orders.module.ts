import { Module, forwardRef } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CancellationService } from './cancellation.service';
import { ScheduledRidesService } from './scheduled-rides.service';
import { ScheduledRidesController } from './scheduled-rides.controller';
import { MultiStopService } from './multi-stop.service';
import { MultiStopController } from './multi-stop.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackingModule } from '../tracking/tracking.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { PaymentsModule } from '../payments/payments.module';
import { RouteOptimizationModule } from '../services/route-optimization.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [PrismaModule, TrackingModule, forwardRef(() => DispatchModule), NotificationsModule, forwardRef(() => PaymentsModule), RouteOptimizationModule, PricingModule],
  controllers: [OrdersController, ScheduledRidesController, MultiStopController],
  providers: [OrdersService, CancellationService, ScheduledRidesService, MultiStopService],
  exports: [OrdersService, CancellationService, ScheduledRidesService, MultiStopService]
})
export class OrdersModule {}
