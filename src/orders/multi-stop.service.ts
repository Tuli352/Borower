import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteOptimizationService } from '../services/route-optimization.service';
import { PricingService } from '../pricing/pricing.service';

@Injectable()
export class MultiStopService {
  private readonly logger = new Logger(MultiStopService.name);

  constructor(
    private prisma: PrismaService,
    private routeOptimizationService: RouteOptimizationService,
    private pricingService: PricingService,
  ) {}

  // Create a multi-stop ride
  async createMultiStopRide(data: {
    customerId: string;
    pickupLocation: string;
    pickupLat: number;
    pickupLng: number;
    stops: Array<{
      address: string;
      lat: number;
      lng: number;
      type: 'pickup' | 'dropoff' | 'waypoint';
      estimatedDuration?: number; // in minutes
    }>;
    finalDropoffLocation: string;
    finalDropoffLat: number;
    finalDropoffLng: number;
    vehiclePreference?: string;
  }) {
    try {
      // Validate stops (minimum 1, maximum 5 stops)
      if (data.stops.length < 1 || data.stops.length > 5) {
        throw new BadRequestException('Multi-stop rides must have between 1 and 5 stops');
      }

      // Build all waypoints for optimization
      const waypoints = [
        { lat: data.pickupLat, lng: data.pickupLng, address: data.pickupLocation },
        ...data.stops.map(stop => ({ lat: stop.lat, lng: stop.lng, address: stop.address })),
        { lat: data.finalDropoffLat, lng: data.finalDropoffLng, address: data.finalDropoffLocation }
      ];

      // Optimize route
      const optimizedRoute = await this.routeOptimizationService.optimizeRoute({
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        dropoffLat: data.finalDropoffLat,
        dropoffLng: data.finalDropoffLng,
        stops: data.stops,
        vehicleType: data.vehiclePreference || 'car'
      });

      // Calculate pricing for multi-stop ride
      const pricing = await this.calculateMultiStopPricing(optimizedRoute.optimizedRoute, data.stops.length);

      // Create the order with multi-stop data
      const order = await this.prisma.order.create({
        data: {
          customerId: data.customerId,
          pickupLocation: data.pickupLocation,
          pickupLat: data.pickupLat,
          pickupLng: data.pickupLng,
          dropoffLocation: data.finalDropoffLocation,
          dropoffLat: data.finalDropoffLat,
          dropoffLng: data.finalDropoffLng,
          amount: pricing.totalAmount,
          type: 'Multi-Stop',
          stops: JSON.stringify({
            original: data.stops,
            optimized: optimizedRoute.optimizedRoute.waypoints,
            totalStops: data.stops.length,
            routeData: optimizedRoute.optimizedRoute
          }),
          optimizedRoute: JSON.stringify(optimizedRoute.optimizedRoute),
          estimatedDuration: optimizedRoute.optimizedRoute.totalDuration,
          vehiclePreference: data.vehiclePreference,
          status: 'Pending',
          commission: pricing.commission,
        }
      });

      this.logger.log(`Multi-stop ride created: ${order.id} with ${data.stops.length} stops`);

      return {
        success: true,
        order,
        optimizedRoute,
        pricing,
        message: `Multi-stop ride created with ${data.stops.length} stops. Estimated duration: ${optimizedRoute.optimizedRoute.totalDuration} minutes`
      };
    } catch (error) {
      this.logger.error(`Failed to create multi-stop ride: ${error.message}`);
      throw error;
    }
  }

  // Calculate pricing for multi-stop rides
  private async calculateMultiStopPricing(routeData: any, stopCount: number): Promise<{
    baseFare: number;
    distanceFare: number;
    stopFees: number;
    timeFare: number;
    totalAmount: number;
    commission: number;
    breakdown: any;
  }> {
    const baseFare = 300; // Higher base fare for multi-stop
    const distanceFare = routeData.totalDistance * 90; // Higher per-km rate
    const stopFees = stopCount * 100; // ₦100 per additional stop
    const timeFare = routeData.totalDuration * 8; // ₦8 per minute
    const totalAmount = baseFare + distanceFare + stopFees + timeFare;
    const commission = totalAmount * 0.15; // 15% commission

    return {
      baseFare,
      distanceFare,
      stopFees,
      timeFare,
      totalAmount,
      commission,
      breakdown: {
        baseFare: { amount: baseFare, description: 'Base fare for multi-stop ride' },
        distance: { amount: distanceFare, description: `${routeData.totalDistance.toFixed(1)}km @ ₦90/km` },
        stops: { amount: stopFees, description: `${stopCount} stops @ ₦100/stop` },
        time: { amount: timeFare, description: `${routeData.totalDuration} minutes @ ₦8/min` },
        commission: { amount: commission, description: 'Platform commission (15%)' }
      }
    };
  }

  // Get multi-stop ride details with route information
  async getMultiStopRideDetails(orderId: string, userId: string, userRole: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, rider: true }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.type !== 'Multi-Stop') {
      throw new BadRequestException('This is not a multi-stop ride');
    }

    // Check access permissions
    const hasAccess = 
      order.customerId === userId ||
      order.riderId === userId ||
      userRole.includes('admin');

    if (!hasAccess) {
      throw new BadRequestException('Access denied');
    }

    // Parse stops data
    const stopsData = JSON.parse(order.stops || '{}');

    return {
      order,
      stops: stopsData.original || [],
      optimizedRoute: JSON.parse(order.optimizedRoute || '{}'),
      routeProgress: await this.getRouteProgress(order),
      nextStop: await this.getNextStop(order),
      estimatedRemainingTime: await this.getEstimatedRemainingTime(order)
    };
  }

  // Update multi-stop ride progress
  async updateMultiStopProgress(orderId: string, riderId: string, data: {
    currentStopIndex: number;
    stopStatus: 'completed' | 'in_progress' | 'skipped';
    actualArrivalTime?: Date;
    notes?: string;
  }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.riderId !== riderId) {
      throw new BadRequestException('Only the assigned rider can update progress');
    }

    if (order.type !== 'Multi-Stop') {
      throw new BadRequestException('This is not a multi-stop ride');
    }

    // Parse existing stops data
    const stopsData = JSON.parse(order.stops || '{}');
    
    // Update stop status
    if (stopsData.original && stopsData.original[data.currentStopIndex]) {
      stopsData.original[data.currentStopIndex].status = data.stopStatus;
      stopsData.original[data.currentStopIndex].actualArrivalTime = data.actualArrivalTime;
      stopsData.original[data.currentStopIndex].notes = data.notes;
    }

    // Update order with new stops data
    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        stops: JSON.stringify(stopsData),
        updatedAt: new Date()
      }
    });

    // Check if all stops are completed
    const allStopsCompleted = stopsData.original?.every((stop: any) => 
      stop.status === 'completed' || stop.status === 'skipped'
    );

    if (allStopsCompleted) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'Completed' }
      });
    }

    return {
      success: true,
      order: updatedOrder,
      allStopsCompleted,
      nextStop: allStopsCompleted ? null : await this.getNextStop(updatedOrder)
    };
  }

  // Get route progress for multi-stop ride
  private async getRouteProgress(order: any): Promise<{
    completedStops: number;
    totalStops: number;
    progressPercentage: number;
    currentStop?: any;
  }> {
    const stopsData = JSON.parse(order.stops || '{}');
    const stops = stopsData.original || [];
    
    const completedStops = stops.filter((stop: any) => stop.status === 'completed').length;
    const totalStops = stops.length;
    const progressPercentage = totalStops > 0 ? (completedStops / totalStops) * 100 : 0;
    
    const currentStop = stops.find((stop: any) => stop.status === 'in_progress');

    return {
      completedStops,
      totalStops,
      progressPercentage,
      currentStop
    };
  }

  // Get next stop for multi-stop ride
  private async getNextStop(order: any): Promise<any> {
    const stopsData = JSON.parse(order.stops || '{}');
    const stops = stopsData.original || [];
    
    return stops.find((stop: any) => 
      stop.status !== 'completed' && stop.status !== 'skipped'
    );
  }

  // Get estimated remaining time
  private async getEstimatedRemainingTime(order: any): Promise<number> {
    const routeProgress = await this.getRouteProgress(order);
    const optimizedRoute = JSON.parse(order.optimizedRoute || '{}');
    
    if (!optimizedRoute.steps || routeProgress.completedStops === 0) {
      return optimizedRoute.totalDuration || 0;
    }

    // Calculate remaining time based on completed steps
    const remainingSteps = optimizedRoute.steps.slice(routeProgress.completedStops);
    const remainingTime = remainingSteps.reduce((total: number, step: any) => {
      const duration = parseInt(step.duration?.replace(' min', '') || '0');
      return total + duration;
    }, 0);

    return remainingTime;
  }

  // Get multi-stop ride statistics
  async getMultiStopStatistics() {
    const totalMultiStop = await this.prisma.order.count({
      where: { type: 'Multi-Stop' }
    });

    const completedMultiStop = await this.prisma.order.count({
      where: { type: 'Multi-Stop', status: 'Completed' }
    });

    const todayMultiStop = await this.prisma.order.count({
      where: {
        type: 'Multi-Stop',
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    });

    // Calculate average stops per ride
    const multiStopOrders = await this.prisma.order.findMany({
      where: { type: 'Multi-Stop' },
      select: { stops: true }
    });

    let totalStops = 0;
    multiStopOrders.forEach(order => {
      const stopsData = JSON.parse(order.stops || '{}');
      totalStops += stopsData.original?.length || 0;
    });

    const averageStops = multiStopOrders.length > 0 ? totalStops / multiStopOrders.length : 0;

    return {
      totalMultiStop,
      completedMultiStop,
      todayMultiStop,
      completionRate: totalMultiStop > 0 ? ((completedMultiStop / totalMultiStop) * 100).toFixed(1) : '0',
      averageStops: averageStops.toFixed(1)
    };
  }

  // Validate multi-stop route feasibility
  async validateMultiStopRoute(data: {
    pickupLat: number;
    pickupLng: number;
    stops: Array<{ lat: number; lng: number; address: string }>;
    finalDropoffLat: number;
    finalDropoffLng: number;
  }): Promise<{
    feasible: boolean;
    issues: string[];
    estimatedDuration: number;
    estimatedDistance: number;
    estimatedCost: number;
  }> {
    const issues: string[] = [];

    // Check total distance (should be reasonable for city rides)
    const waypoints = [
      { lat: data.pickupLat, lng: data.pickupLng },
      ...data.stops,
      { lat: data.finalDropoffLat, lng: data.finalDropoffLng }
    ];

    try {
      const optimizedRoute = await this.routeOptimizationService.optimizeRoute({
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        dropoffLat: data.finalDropoffLat,
        dropoffLng: data.finalDropoffLng,
        stops: data.stops
      });

      const { totalDistance, totalDuration } = optimizedRoute.optimizedRoute;

      // Validate distance
      if (totalDistance > 50) {
        issues.push('Total distance exceeds 50km - may not be practical for city ride');
      }

      // Validate duration
      if (totalDuration > 180) {
        issues.push('Estimated duration exceeds 3 hours - consider splitting into multiple rides');
      }

      // Calculate estimated cost
      const pricing = await this.calculateMultiStopPricing(optimizedRoute.optimizedRoute, data.stops.length);

      return {
        feasible: issues.length === 0,
        issues,
        estimatedDuration: totalDuration,
        estimatedDistance: totalDistance,
        estimatedCost: pricing.totalAmount
      };
    } catch (error) {
      return {
        feasible: false,
        issues: ['Failed to optimize route - please check waypoint coordinates'],
        estimatedDuration: 0,
        estimatedDistance: 0,
        estimatedCost: 0
      };
    }
  }
}
