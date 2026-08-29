import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchService } from '../dispatch/dispatch.service';

@Injectable()
export class ScheduledOrdersService {
  private readonly logger = new Logger(ScheduledOrdersService.name);

  constructor(
    private prisma: PrismaService,
    private dispatchService: DispatchService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledOrders() {
    this.logger.log('Checking for scheduled orders due for dispatch...');

    // 1. Find orders scheduled to start in the next 15 minutes that are still in 'Scheduled' status
    const fifteenMinutesFromNow = new Date(Date.now() + 15 * 60 * 1000);

    const ordersToDispatch = await this.prisma.order.findMany({
      where: {
        status: 'Scheduled',
        isScheduled: true,
        scheduledAt: {
          lte: fifteenMinutesFromNow,
          gte: new Date(), // Already starting or soon
        },
      },
    });

    if (ordersToDispatch.length === 0) return;

    this.logger.log(`Found ${ordersToDispatch.length} scheduled orders to dispatch.`);

    for (const order of ordersToDispatch) {
      try {
        // 2. Change status to 'Pending' so the driver can see/accept it
        await this.prisma.order.update({
          where: { id: order.id },
          data: { status: 'Pending' },
        });

        // 3. Trigger the matching engine
        await this.dispatchService.findOffersForRequest(order.id);
        
        this.logger.log(`Order ${order.id} moved to dispatch queue.`);
      } catch (err) {
        this.logger.error(`Failed to dispatch scheduled order ${order.id}:`, err);
      }
    }
  }
}
