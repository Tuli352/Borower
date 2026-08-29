import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import axios from 'axios';

@Injectable()
export class SmartDispatchService {
  private readonly logger = new Logger(SmartDispatchService.name);

  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
  ) {}

  // Enhanced dispatch with multiple scoring factors
  async findBestRidersForOrder(orderId: string, limit: number = 5) {
    const order = await this.prisma.order.findUnique({ 
      where: { id: orderId },
      include: { customer: true }
    });
    
    if (!order || !order.pickupLat || !order.pickupLng) {
      throw new Error('Invalid order location data');
    }

    // Get active ride request
    const rideReq = await this.prisma.activeRideRequest.findUnique({ where: { orderId } });
    const declinedIds: string[] = rideReq ? JSON.parse(rideReq.declinedRiders) : [];

    // Get all eligible riders
    const onlineRiders = await this.prisma.rider.findMany({
      where: { 
        status: 'Online',
        latitude: { not: null },
        longitude: { not: null },
        orders: {
          none: {
            status: {
              in: ['Accepted', 'Arrived', 'DriverArrived', 'PickedUp', 'AtDropoff', 'InProgress']
            }
          }
        }
      },
      include: {
        transactions: true,
        orders: {
          where: { status: 'Completed' },
          select: { rating: true, createdAt: true }
        }
      }
    });

    const categories = await this.prisma.vehicleCategory.findMany();
    const categoryCapacityMap = new Map(categories.map(c => [c.name, c.capacity]));
    const requiredSeats = order.seats || 1;

    // Filter out riders whose vehicle capacity is less than required seats
    const eligibleRiders = onlineRiders.filter(r => {
       const capacity = r.vehicleType ? (categoryCapacityMap.get(r.vehicleType) || 4) : 4;
       return capacity >= requiredSeats;
    });

    this.logger.log(`🔍 [SMART DISPATCH] Found ${eligibleRiders.length} eligible online riders with capacity >= ${requiredSeats} for order ${orderId}`);
    eligibleRiders.forEach(r => {
      const dist = this.calculateDistance(order.pickupLat!, order.pickupLng!, r.latitude!, r.longitude!);
      this.logger.log(`  📏 ${r.name} (${r.id}): ${dist.toFixed(2)}km, status=${r.status}, rating=${r.rating}`);
    });

    // Score each rider based on multiple factors
    const scoredRiders = await Promise.all(
      eligibleRiders
        .filter(rider => !declinedIds.includes(rider.id))
        .map(async (rider) => {
          const score = await this.calculateRiderScore(rider, order);
          return { ...rider, ...score };
        })
    );

    // Sort by score and return top candidates
    const result = scoredRiders
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit);
    
    this.logger.log(`✅ [SMART DISPATCH] Returning ${result.length} candidates (top scores: ${result.map(r => `${r.name}=${r.totalScore.toFixed(3)}`).join(', ')})`);
    return result;
  }

  // Comprehensive rider scoring algorithm
  private async calculateRiderScore(rider: any, order: any) {
    const distance = this.calculateDistance(
      order.pickupLat, order.pickupLng,
      rider.latitude, rider.longitude
    );

    // ETA calculation based on distance and average speed
    const etaToPickup = this.calculateETA(distance);

    // Driver performance metrics
    const ratingScore = (rider.rating - 1.0) / 4.0; // Normalize to 0-1
    const completionRate = this.calculateCompletionRate(rider.orders);
    const recentActivity = this.calculateRecentActivity(rider.orders);
    const earningsScore = this.calculateEarningsScore(rider.earnings || 0);

    // Distance-based scoring (closer is better)
    const distanceScore = Math.max(0, 1 - (distance / 10)); // Normalize, 10km = 0 score

    // Availability score based on current streak
    const availabilityScore = Math.min(1, (rider.streak || 0) / 30); // 30 day streak = max

    // Customer preference (if customer has favorite riders)
    const preferenceScore = await this.calculateCustomerPreference(rider.id, order.customerId);

    // Weighted total score
    const weights = {
      distance: 0.25,
      rating: 0.20,
      completion: 0.15,
      availability: 0.15,
      earnings: 0.10,
      recent: 0.10,
      preference: 0.05
    };

    const totalScore = 
      (distanceScore * weights.distance) +
      (ratingScore * weights.rating) +
      (completionRate * weights.completion) +
      (availabilityScore * weights.availability) +
      (earningsScore * weights.earnings) +
      (recentActivity * weights.recent) +
      (preferenceScore * weights.preference);

    return {
      distance,
      etaToPickup,
      distanceScore,
      ratingScore,
      completionRate,
      recentActivity,
      earningsScore,
      availabilityScore,
      preferenceScore,
      totalScore
    };
  }

  // Calculate completion rate
  private calculateCompletionRate(orders: any[]): number {
    if (orders.length === 0) return 0.5; // Default for new drivers
    
    const completedOrders = orders.filter(order => order.rating !== null).length;
    return completedOrders / orders.length;
  }

  // Calculate recent activity (last 7 days)
  private calculateRecentActivity(orders: any[]): number {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentOrders = orders.filter(order => 
      new Date(order.createdAt) > sevenDaysAgo
    ).length;
    
    return Math.min(1, recentOrders / 10); // 10+ orders in 7 days = max score
  }

  // Calculate earnings score
  private calculateEarningsScore(earnings: number): number {
    // Normalize earnings (assuming 50000 NGN is good monthly earnings)
    return Math.min(1, earnings / 50000);
  }

  // Calculate customer preference
  private async calculateCustomerPreference(riderId: string, customerId: string): Promise<number> {
    // Check if customer has previously rated this rider highly
    const previousOrders = await this.prisma.order.findMany({
      where: {
        customerId,
        riderId,
        rating: { not: null }
      }
    });

    if (previousOrders.length === 0) return 0.5; // Neutral

    const avgRating = previousOrders.reduce((sum, order) => sum + (order.rating || 0), 0) / previousOrders.length;
    return avgRating / 5; // Normalize to 0-1
  }

  // Enhanced ETA calculation with traffic consideration
  async calculateETAWithTraffic(pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number): Promise<{
    etaMinutes: number;
    distanceKm: number;
    trafficLevel: 'low' | 'medium' | 'high';
  }> {
    try {
      // Use Google Maps API or similar for real-time traffic
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (apiKey) {
        const response = await axios.get(
          `https://maps.googleapis.com/maps/api/distancematrix/json`,
          {
            params: {
              origins: `${pickupLat},${pickupLng}`,
              destinations: `${dropoffLat},${dropoffLng}`,
              departure_time: 'now',
              traffic_model: 'best_guess',
              key: apiKey
            }
          }
        );

        const element = response.data.rows[0].elements[0];
        if (element.status === 'OK') {
          const duration = element.duration;
          const durationInTraffic = element.duration_in_traffic;
          const distance = element.distance;

          const trafficLevel = this.determineTrafficLevel(duration.value, durationInTraffic.value);
          
          return {
            etaMinutes: Math.ceil(durationInTraffic.value / 60),
            distanceKm: distance.value / 1000,
            trafficLevel
          };
        }
      }
    } catch (error) {
      this.logger.warn('Failed to get traffic data, using fallback calculation');
    }

    // Fallback to basic calculation
    const distance = this.calculateDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const etaMinutes = Math.ceil((distance / 40) * 60); // Assuming 40 km/h average speed
    
    return {
      etaMinutes,
      distanceKm: distance,
      trafficLevel: 'medium'
    };
  }

  private determineTrafficLevel(normalDuration: number, trafficDuration: number): 'low' | 'medium' | 'high' {
    const ratio = trafficDuration / normalDuration;
    if (ratio <= 1.2) return 'low';
    if (ratio <= 1.5) return 'medium';
    return 'high';
  }

  // Basic distance calculation
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
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

  // Simple ETA calculation
  private calculateETA(distanceKm: number): number {
    return Math.ceil((distanceKm / 40) * 60); // Minutes
  }

  // Send ride offer to multiple top candidates simultaneously
  async sendRideOffersToTopCandidates(orderId: string, candidates: any[]) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true }
    });
    
    // Update ride request to multi-offer mode
    await this.prisma.activeRideRequest.update({
      where: { orderId },
      data: {
        status: 'MULTI_OFFER',
        pingTimeout: new Date(Date.now() + 20000), // 20 seconds for multi-offer
      }
    });

    // Send offers to top 3 candidates
    const topCandidates = candidates.slice(0, 3);
    
    for (const candidate of topCandidates) {
      const eventName = `ride_offer_${candidate.id}`;
      this.logger.log(`📡 [SMART DISPATCH] Emitting '${eventName}' for order ${orderId} to rider ${candidate.name} (${candidate.id})`);
      this.logger.log(`  💰 Amount: ${order?.amount}, Pickup: ${order?.pickupLocation}, Dropoff: ${order?.dropoffLocation}`);
      
      const payload = {
        orderId: order?.id,
        pickup: order?.pickupLocation,
        dropoff: order?.dropoffLocation,
        amount: order?.amount,
        distanceToPickup: candidate.distance?.toFixed(1) ?? '0',
        etaToPickup: candidate.etaToPickup,
        driverScore: candidate.totalScore?.toFixed(2) ?? '0',
        timeout: 20,
        competitionMode: true, // Let riders know others are also being offered
        customerName: order?.customer?.name || 'Customer',
        customerPhone: order?.customer?.phone || '',
        pickupLat: order?.pickupLat,
        pickupLng: order?.pickupLng,
        dropoffLat: order?.dropoffLat,
        dropoffLng: order?.dropoffLng,
      };

      // 1. Emit using original targeted event name
      this.trackingGateway.server.emit(eventName, payload);
      
      // 2. Emit to the specific rider room (using the new fallback events)
      this.trackingGateway.server.to(`rider_${candidate.id}`).emit('new_ride_request', payload);
      this.trackingGateway.server.to(`rider_${candidate.id}`).emit('ride_offer', payload);
    }

    this.logger.log(`✅ [SMART DISPATCH] Multi-offer sent for order ${orderId} to ${topCandidates.length} top candidates: [${topCandidates.map(c => c.id).join(', ')}]`);
    return topCandidates;
  }
}
