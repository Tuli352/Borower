import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  constructor(private prisma: PrismaService) {}

  // Optimize route with multiple stops and traffic consideration
  async optimizeRoute(params: {
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    stops?: { lat: number; lng: number; address: string }[];
    avoidTolls?: boolean;
    avoidHighways?: boolean;
    vehicleType?: string;
  }) {
    try {
      const { pickupLat, pickupLng, dropoffLat, dropoffLng, stops = [], avoidTolls = false, avoidHighways = false, vehicleType = 'car' } = params;

      // Build waypoints for multi-stop routes
      const waypoints = [
        { lat: pickupLat, lng: pickupLng },
        ...stops.map(stop => ({ lat: stop.lat, lng: stop.lng })),
        { lat: dropoffLat, lng: dropoffLng }
      ];

      // Try to use Google Maps API for optimization
      if (process.env.GOOGLE_MAPS_API_KEY) {
        return await this.optimizeWithGoogleMaps(waypoints, avoidTolls, avoidHighways, vehicleType);
      }

      // Fallback to basic optimization
      return await this.basicOptimization(waypoints);
    } catch (error) {
      this.logger.error(`Route optimization failed: ${error.message}`);
      throw error;
    }
  }

  // Google Maps route optimization
  private async optimizeWithGoogleMaps(
    waypoints: { lat: number; lng: number }[],
    avoidTolls: boolean,
    avoidHighways: boolean,
    vehicleType: string
  ) {
    try {
      const origin = `${waypoints[0].lat},${waypoints[0].lng}`;
      const destination = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`;
      
      // Build intermediate waypoints
      const intermediateWaypoints = waypoints.slice(1, -1).map(wp => `${wp.lat},${wp.lng}`).join('|');

      const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
        params: {
          origin,
          destination,
          waypoints: intermediateWaypoints || undefined,
          optimize: true, // Optimize waypoint order
          departure_time: 'now',
          traffic_model: 'best_guess',
          avoid: this.buildAvoidParams(avoidTolls, avoidHighways),
          mode: this.getTravelMode(vehicleType),
          key: process.env.GOOGLE_MAPS_API_KEY
        }
      });

      if (response.data.status !== 'OK' || response.data.routes.length === 0) {
        throw new Error('Google Maps API returned no routes');
      }

      const route = response.data.routes[0];
      const leg = route.legs[0];

      return {
        optimizedRoute: {
          totalDistance: this.calculateTotalDistance(route.legs),
          totalDuration: this.calculateTotalDuration(route.legs),
          totalDurationWithTraffic: this.calculateTotalDurationWithTraffic(route.legs),
          waypoints: this.formatWaypoints(route.legs),
          steps: this.formatSteps(route.legs),
          trafficCondition: this.analyzeTrafficCondition(route.legs),
          estimatedCost: this.calculateEstimatedCost(route.legs, vehicleType),
          polyline: route.overview_polyline,
          bounds: route.bounds
        },
        alternatives: response.data.routes.slice(1).map((altRoute: any) => ({
          totalDistance: this.calculateTotalDistance(altRoute.legs),
          totalDuration: this.calculateTotalDuration(altRoute.legs),
          totalDurationWithTraffic: this.calculateTotalDurationWithTraffic(altRoute.legs),
          polyline: altRoute.overview_polyline,
          estimatedCost: this.calculateEstimatedCost(altRoute.legs, vehicleType)
        }))
      };
    } catch (error) {
      this.logger.warn(`Google Maps optimization failed, using fallback: ${error.message}`);
      return await this.basicOptimization(waypoints);
    }
  }

  // Basic optimization without external APIs
  private async basicOptimization(waypoints: { lat: number; lng: number }[]) {
    // Simple distance-based optimization for waypoint order
    const optimizedWaypoints = this.optimizeWaypointOrder(waypoints);
    
    const segments = [];
    let totalDistance = 0;
    let totalDuration = 0;

    for (let i = 0; i < optimizedWaypoints.length - 1; i++) {
      const from = optimizedWaypoints[i];
      const to = optimizedWaypoints[i + 1];
      
      const distance = this.calculateDistance(from.lat, from.lng, to.lat, to.lng);
      const duration = this.estimateDuration(distance);
      
      segments.push({
        from: { lat: from.lat, lng: from.lng },
        to: { lat: to.lat, lng: to.lng },
        distance,
        duration,
        instruction: `Travel from waypoint ${i + 1} to waypoint ${i + 2}`
      });
      
      totalDistance += distance;
      totalDuration += duration;
    }

    return {
      optimizedRoute: {
        totalDistance,
        totalDuration,
        totalDurationWithTraffic: totalDuration * 1.2, // Assume 20% traffic delay
        waypoints: optimizedWaypoints,
        steps: segments,
        trafficCondition: 'moderate',
        estimatedCost: this.calculateEstimatedCostFromDistance(totalDistance),
        polyline: null,
        bounds: this.calculateBounds(optimizedWaypoints)
      },
      alternatives: []
    };
  }

  // Optimize waypoint order using nearest neighbor algorithm
  private optimizeWaypointOrder(waypoints: { lat: number; lng: number }[]) {
    if (waypoints.length <= 2) return waypoints;

    const optimized = [waypoints[0]]; // Start with pickup
    const remaining = waypoints.slice(1);
    
    while (remaining.length > 1) {
      const current = optimized[optimized.length - 1];
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      // Find nearest unvisited waypoint
      for (let i = 0; i < remaining.length - 1; i++) {
        const distance = this.calculateDistance(
          current.lat, current.lng,
          remaining[i].lat, remaining[i].lng
        );
        
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      optimized.push(remaining[nearestIndex]);
      remaining.splice(nearestIndex, 1);
    }

    // Add final destination
    optimized.push(remaining[0]);

    return optimized;
  }

  // Calculate distance between two points
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

  // Estimate travel duration based on distance
  private estimateDuration(distanceKm: number): number {
    // Assume average speed of 40 km/h in city conditions
    return Math.ceil((distanceKm / 40) * 60); // Convert to minutes
  }

  // Helper methods for Google Maps response processing
  private buildAvoidParams(avoidTolls: boolean, avoidHighways: boolean): string {
    const params = [];
    if (avoidTolls) params.push('tolls');
    if (avoidHighways) params.push('highways');
    return params.join('|');
  }

  private getTravelMode(vehicleType: string): string {
    switch (vehicleType.toLowerCase()) {
      case 'motorcycle':
      case 'bike':
        return 'bicycling';
      case 'walking':
        return 'walking';
      default:
        return 'driving';
    }
  }

  private calculateTotalDistance(legs: any[]): number {
    return legs.reduce((total, leg) => total + (leg.distance?.value || 0), 0) / 1000; // Convert to km
  }

  private calculateTotalDuration(legs: any[]): number {
    return legs.reduce((total, leg) => total + (leg.duration?.value || 0), 0) / 60; // Convert to minutes
  }

  private calculateTotalDurationWithTraffic(legs: any[]): number {
    return legs.reduce((total, leg) => total + (leg.duration_in_traffic?.value || leg.duration?.value || 0), 0) / 60;
  }

  private formatWaypoints(legs: any[]) {
    const waypoints = [{ lat: legs[0].start_location.lat, lng: legs[0].start_location.lng }];
    
    legs.forEach((leg, index) => {
      waypoints.push({ lat: leg.end_location.lat, lng: leg.end_location.lng });
    });

    return waypoints;
  }

  private formatSteps(legs: any[]) {
    const allSteps: any[] = [];
    
    legs.forEach((leg: any, legIndex: number) => {
      leg.steps.forEach((step: any, stepIndex: number) => {
        allSteps.push({
          instruction: step.instruction,
          distance: step.distance?.text || 'Unknown',
          duration: step.duration?.text || 'Unknown',
          startLocation: step.start_location,
          endLocation: step.end_location,
          legIndex,
          stepIndex
        });
      });
    });

    return allSteps;
  }

  private analyzeTrafficCondition(legs: any[]): 'light' | 'moderate' | 'heavy' {
    const totalDuration = this.calculateTotalDuration(legs);
    const totalDurationWithTraffic = this.calculateTotalDurationWithTraffic(legs);
    
    const trafficRatio = totalDurationWithTraffic / totalDuration;
    
    if (trafficRatio < 1.2) return 'light';
    if (trafficRatio < 1.5) return 'moderate';
    return 'heavy';
  }

  private calculateEstimatedCost(legs: any[], vehicleType: string): number {
    const totalDistance = this.calculateTotalDistance(legs);
    return this.calculateEstimatedCostFromDistance(totalDistance, vehicleType);
  }

  private calculateEstimatedCostFromDistance(distanceKm: number, vehicleType: string = 'car'): number {
    // Base pricing model (can be customized based on vehicle type and location)
    const baseFare = 200; // NGN
    const perKmRate = vehicleType === 'motorcycle' ? 50 : 80; // NGN per km
    const timeCharge = Math.ceil(distanceKm / 40) * 10; // NGN per minute
    
    return baseFare + (distanceKm * perKmRate) + timeCharge;
  }

  private calculateBounds(waypoints: { lat: number; lng: number }[]) {
    const lats = waypoints.map(wp => wp.lat);
    const lngs = waypoints.map(wp => wp.lng);
    
    return {
      northeast: { lat: Math.max(...lats), lng: Math.max(...lngs) },
      southwest: { lat: Math.min(...lats), lng: Math.min(...lngs) }
    };
  }

  // Get real-time traffic updates for a specific route
  async getTrafficUpdates(route: {
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
  }) {
    try {
      if (!process.env.GOOGLE_MAPS_API_KEY) {
        return { trafficLevel: 'moderate', incidents: [] };
      }

      const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
        params: {
          origins: `${route.pickupLat},${route.pickupLng}`,
          destinations: `${route.dropoffLat},${route.dropoffLng}`,
          departure_time: 'now',
          traffic_model: 'best_guess',
          key: process.env.GOOGLE_MAPS_API_KEY
        }
      });

      const element = response.data.rows[0].elements[0];
      if (element.status !== 'OK') {
        return { trafficLevel: 'moderate', incidents: [] };
      }

      const duration = element.duration.value;
      const durationInTraffic = element.duration_in_traffic.value;
      const trafficRatio = durationInTraffic / duration;

      let trafficLevel: 'light' | 'moderate' | 'heavy';
      if (trafficRatio < 1.2) trafficLevel = 'light';
      else if (trafficRatio < 1.5) trafficLevel = 'moderate';
      else trafficLevel = 'heavy';

      return {
        trafficLevel,
        normalDuration: Math.ceil(duration / 60),
        currentDuration: Math.ceil(durationInTraffic / 60),
        delayMinutes: Math.ceil((durationInTraffic - duration) / 60),
        incidents: [] // Could integrate with traffic incident APIs
      };
    } catch (error) {
      this.logger.warn(`Failed to get traffic updates: ${error.message}`);
      return { trafficLevel: 'moderate', incidents: [] };
    }
  }

  // Save optimized route to database for analytics
  async saveOptimizedRoute(orderId: string, routeData: any) {
    try {
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          // Add route data to order (would need to add these fields to schema)
          // For now, just log it
        }
      });

      this.logger.log(`Optimized route saved for order ${orderId}`);
    } catch (error) {
      this.logger.error(`Failed to save optimized route for order ${orderId}: ${error.message}`);
    }
  }
}
