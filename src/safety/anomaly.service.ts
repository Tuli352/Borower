import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkRouteAnomalies() {
    this.logger.debug('Running AI Route Anomaly Detection...');
    
    const activeOrders = await this.prisma.order.findMany({
      where: { 
        status: { in: ['PickedUp', 'InProgress'] },
        riderId: { not: null }
      },
      include: { rider: true }
    });

    for (const order of activeOrders) {
      if (!order.rider || !order.rider.latitude || !order.rider.longitude) continue;
      if (!order.dropoffLat || !order.pickupLat) continue;
      
      const distToDropoff = this.calculateDistance(
        order.rider.latitude, order.rider.longitude,
        order.dropoffLat, order.dropoffLng!
      );

      const distToPickup = this.calculateDistance(
        order.rider.latitude, order.rider.longitude,
        order.pickupLat, order.pickupLng!
      );

      // Heuristic: If driver is > 30km away from both pickup and dropoff (adjust for scale)
      // And it's not an interstate ride.
      if (!order.isInterstate && distToDropoff > 30 && distToPickup > 30) {
        this.logger.warn(`🚨 Anomaly detected for Order ${order.id}. Rider ${order.riderId} is suspiciously far.`);
        
        const existingReport = await this.prisma.anomalyReport.findFirst({
            where: { orderId: order.id, type: 'ROUTE_DEVIATION' }
        });

        if (!existingReport) {
            await this.prisma.anomalyReport.create({
                data: {
                    orderId: order.id,
                    riderId: order.riderId!,
                    type: 'ROUTE_DEVIATION',
                    description: `Rider is ${Math.round(distToDropoff)}km from dropoff and ${Math.round(distToPickup)}km from pickup.`,
                    location: JSON.stringify({ lat: order.rider.latitude, lng: order.rider.longitude }),
                    status: 'PENDING'
                }
            });

            this.eventEmitter.emit('anomaly.detected', { orderId: order.id, riderId: order.riderId! });
        }
      }
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
