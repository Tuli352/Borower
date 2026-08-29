import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { OrdersService } from '../orders/orders.service';
import { SmartDispatchService } from './smart-dispatch.service';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
    @Inject(forwardRef(() => OrdersService))
    private ordersService: OrdersService,
    private smartDispatchService: SmartDispatchService,
  ) {}

  // Haversine formula to calculate distance in km between two lat/lng points
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async findOffersForRequest(orderId: string, targetRiderId?: string) {
    this.logger.log(`🚀 [DISPATCH] Starting dispatch for order ${orderId}${targetRiderId ? ` (target rider: ${targetRiderId})` : ''}`);
    
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true }
    });
    if (!order || !order.pickupLat || !order.pickupLng) {
      this.logger.error(`❌ [DISPATCH] Order ${orderId} lacks geospatial data. pickupLat=${order?.pickupLat}, pickupLng=${order?.pickupLng}`);
      return { success: false, message: 'Invalid order location' };
    }
    this.logger.log(`📍 [DISPATCH] Order pickup: [${order.pickupLat}, ${order.pickupLng}] → ${order.pickupLocation}`);

    // Attempt to find active ride request record
    let rideReq = await this.prisma.activeRideRequest.findUnique({ where: { orderId } });
    if (!rideReq) {
      rideReq = await this.prisma.activeRideRequest.create({
        data: { orderId, status: 'SEARCHING' },
      });
    }

    if (rideReq.status === 'ACCEPTED' || rideReq.status === 'CANCELLED') {
      return { success: false, message: 'Request closed' };
    }

    // Handle target rider case
    if (targetRiderId) {
      const selectedRider = await this.prisma.rider.findUnique({ where: { id: targetRiderId } });
      if (!selectedRider || selectedRider.status !== 'Online') {
         this.logger.log(`Target rider ${targetRiderId} is not available/online. Falling back to smart dispatch.`);
      } else {
        // Calculate distance to ensure it's displayed
        const distance = this.calculateDistance(
          order?.pickupLat as number, 
          order?.pickupLng as number, 
          selectedRider.latitude as number, 
          selectedRider.longitude as number
        );
        
        // Lock the request to this rider
        await this.prisma.activeRideRequest.update({
          where: { id: rideReq.id },
          data: {
            currentRiderId: selectedRider.id,
            status: 'OFFERED',
            pingTimeout: new Date(Date.now() + 15000),
          },
        });

        // Send WebSocket push
        this.trackingGateway.server.emit(`ride_offer_${selectedRider.id}`, {
          orderId: order.id,
          pickup: order.pickupLocation,
          dropoff: order.dropoffLocation,
          amount: order.amount,
          distanceToPickup: distance.toFixed(1),
          etaToPickup: Math.ceil((distance / 40) * 60),
          timeout: 15,
          customerName: order.customer?.name || 'Customer',
          customerPhone: order.customer?.phone || '',
          pickupLat: order.pickupLat,
          pickupLng: order.pickupLng,
          dropoffLat: order.dropoffLat,
          dropoffLng: order.dropoffLng,
        });

        this.logger.log(`Offered order ${orderId} to target rider ${selectedRider.id} (${distance.toFixed(1)}km)`);
        return { success: true, offeredTo: selectedRider.id };
      }
    }

    // Use smart dispatch algorithm
    try {
      this.logger.log(`🔍 [DISPATCH] Running smart dispatch for order ${orderId}...`);
      const bestCandidates = await this.smartDispatchService.findBestRidersForOrder(orderId, 5);
      
      if (bestCandidates.length === 0) {
        this.logger.warn(`⚠️ [DISPATCH] No available riders found for order ${orderId}. Checking online rider count...`);
        const onlineCount = await this.prisma.rider.count({ where: { status: 'Online' } });
        const totalCount = await this.prisma.rider.count();
        this.logger.warn(`⚠️ [DISPATCH] Database has ${totalCount} total riders, ${onlineCount} online.`);
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: 'No Riders Available' },
        });
        return { success: false, message: 'No riders available' };
      }
      this.logger.log(`✅ [DISPATCH] Found ${bestCandidates.length} candidates for order ${orderId}`);

      // Send multi-offer to top candidates
      const offeredCandidates = await this.smartDispatchService.sendRideOffersToTopCandidates(orderId, bestCandidates);
      
      this.logger.log(`Smart dispatch: Multi-offer sent for order ${orderId} to ${offeredCandidates.length} top candidates`);
      return { 
        success: true, 
        offeredTo: offeredCandidates.map(c => c.id),
        dispatchType: 'smart_multi_offer',
        candidates: offeredCandidates.map(c => ({
          id: c.id,
          name: c.name,
          distance: c.distance,
          etaToPickup: c.etaToPickup,
          score: c.totalScore
        }))
      };
    } catch (error) {
      this.logger.error(`Smart dispatch failed for order ${orderId}, falling back to basic dispatch: ${error.message}`);
      return await this.fallbackBasicDispatch(orderId, rideReq);
    }
  }

  // Fallback to basic dispatch if smart dispatch fails
  private async fallbackBasicDispatch(orderId: string, rideReq: any) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true }
    });
    const declinedIds: string[] = JSON.parse(rideReq.declinedRiders);
    
    const onlineRiders = await this.prisma.rider.findMany({
      where: { 
        status: 'Online',
        orders: {
          none: {
            status: {
              in: ['Accepted', 'Arrived', 'DriverArrived', 'PickedUp', 'AtDropoff', 'InProgress']
            }
          }
        }
      },
    });
    this.logger.log(`🔍 [DISPATCH FALLBACK] Found ${onlineRiders.length} online riders. Declined: [${declinedIds.join(', ')}]`);

    const candidateRiders = onlineRiders
      .filter((r) => r.latitude != null && r.longitude != null && !declinedIds.includes(r.id))
      .map((r) => {
        const distance = this.calculateDistance(
          order?.pickupLat as number, 
          order?.pickupLng as number, 
          r.latitude as number, 
          r.longitude as number
        );
        this.logger.log(`  📏 Rider ${r.name} (${r.id}): ${distance.toFixed(2)}km away at [${r.latitude}, ${r.longitude}]`);
        return { ...r, distance };
      })
      .filter((r) => r.distance <= 15.0)  // Increased from 7km to 15km for broader coverage
      .sort((a, b) => a.distance - b.distance);

    if (candidateRiders.length === 0) {
      return { success: false, message: 'No riders available' };
    }

    const selectedRider = candidateRiders[0];

    await this.prisma.activeRideRequest.update({
      where: { id: rideReq.id },
      data: {
        currentRiderId: selectedRider.id,
        status: 'OFFERED',
        pingTimeout: new Date(Date.now() + 15000),
      },
    });

    // Send WebSocket push to this specific rider
    this.trackingGateway.server.emit(`ride_offer_${selectedRider.id}`, {
      orderId: order?.id,
      pickup: order?.pickupLocation,
      dropoff: order?.dropoffLocation,
      amount: order?.amount,
      distanceToPickup: selectedRider.distance.toFixed(1),
      timeout: 15, // seconds
      customerName: order?.customer?.name || 'Customer',
      customerPhone: order?.customer?.phone || '',
      pickupLat: order?.pickupLat,
      pickupLng: order?.pickupLng,
      dropoffLat: order?.dropoffLat,
      dropoffLng: order?.dropoffLng,
    });

    return { success: true, offeredTo: selectedRider.id, dispatchType: 'basic_fallback' };
  }

  // Mobile App calls this endpoint/socket when rider declines or timed out
  async declineOffer(orderId: string, riderId: string) {
    const rideReq = await this.prisma.activeRideRequest.findUnique({ where: { orderId } });
    if (!rideReq || rideReq.currentRiderId !== riderId) return false;

    const declinedIds = JSON.parse(rideReq.declinedRiders);
    declinedIds.push(riderId);

    await this.prisma.activeRideRequest.update({
      where: { id: rideReq.id },
      data: {
        currentRiderId: null,
        status: 'SEARCHING',
        declinedRiders: JSON.stringify(declinedIds),
      },
    });

    // Cascade to next rider
    this.findOffersForRequest(orderId);
    return true;
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleOfferTimeouts() {
    const expiredRequests = await this.prisma.activeRideRequest.findMany({
      where: {
        status: 'OFFERED',
        pingTimeout: { lte: new Date() },
      },
    });

    for (const req of expiredRequests) {
      if (req.currentRiderId) {
        this.logger.log(`Offer for order ${req.orderId} timed out for rider ${req.currentRiderId}. Auto-declining.`);
        await this.declineOffer(req.orderId, req.currentRiderId);
      }
    }
  }

  async acceptOffer(orderId: string, riderId: string) {
    const rideReq = await this.prisma.activeRideRequest.findUnique({ where: { orderId } });
    if (!rideReq) {
      return { success: false, message: 'Ride request not found' };
    }

    if (rideReq.currentRiderId !== riderId && rideReq.status !== 'SEARCHING') {
       // Allow acceptance if it's still searching (e.g. race condition) or if it's offered to this rider
       if (rideReq?.status === 'ACCEPTED') return { success: false, message: 'Already accepted by another rider' };
    }

    // Update order status via OrdersService (which handles notifications)
    await this.ordersService.updateStatus(orderId, 'Accepted', riderId);

    // Update active request status
    await this.prisma.activeRideRequest.update({
      where: { id: rideReq.id },
      data: {
        status: 'ACCEPTED',
        currentRiderId: riderId,
      },
    });

    return { success: true };
  }
}
