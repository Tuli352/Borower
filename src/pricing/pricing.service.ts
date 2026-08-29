import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(private prisma: PrismaService) {}

  // Haversine formula to calculate straightforward distance estimate
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

  private getHaversineTotal(pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number, stops?: { lat: number; lng: number }[]): number {
    let distanceKm = 0;
    if (stops && stops.length > 0) {
      distanceKm += this.calculateDistance(pickupLat, pickupLng, stops[0].lat, stops[0].lng);
      for (let i = 0; i < stops.length - 1; i++) {
        distanceKm += this.calculateDistance(stops[i].lat, stops[i].lng, stops[i + 1].lat, stops[i + 1].lng);
      }
      distanceKm += this.calculateDistance(stops[stops.length - 1].lat, stops[stops.length - 1].lng, dropoffLat, dropoffLng);
    } else {
      distanceKm = this.calculateDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
    }
    return distanceKm;
  }

  async estimateFare(
    pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number, 
    categoryName: string = 'Kogi Lite', 
    promoCode?: string, 
    stops?: { lat: number; lng: number }[],
    options?: { seats?: number; isShared?: boolean; isInterstate?: boolean; deliveryMode?: boolean; customerId?: string }
  ) {
    let distanceKm = 0;
    let durationMin = 0;
    let polyline = null;
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (googleApiKey) {
      try {
        const waypoints = stops && stops.length > 0 
           ? stops.map(s => `via:${s.lat},${s.lng}`).join('|')
           : '';
           
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${pickupLat},${pickupLng}&destination=${dropoffLat},${dropoffLng}${waypoints ? `&waypoints=${waypoints}` : ''}&key=${googleApiKey}`;
        const response = await axios.get(url);
        
        if (response.data.routes && response.data.routes.length > 0) {
           const route = response.data.routes[0];
           const legs = route.legs;
           const totalMeters = legs.reduce((acc: number, leg: any) => acc + leg.distance.value, 0);
           const totalSeconds = legs.reduce((acc: number, leg: any) => acc + (leg.duration_in_traffic?.value || leg.duration.value), 0);
           
           distanceKm = totalMeters / 1000;
           durationMin = Math.ceil(totalSeconds / 60);
           polyline = route.overview_polyline.points;
           
           this.logger.debug(`Google Maps distance: ${distanceKm}km, duration: ${durationMin}min`);
        } else {
           this.logger.warn('Google Maps API found no route, falling back to Haversine');
           distanceKm = this.getHaversineTotal(pickupLat, pickupLng, dropoffLat, dropoffLng, stops);
           durationMin = Math.ceil((distanceKm / 30) * 60); // Assume 30km/h fallback
        }
      } catch (error) {
         this.logger.error('Google Maps API failed, falling back to Haversine', error);
         distanceKm = this.getHaversineTotal(pickupLat, pickupLng, dropoffLat, dropoffLng, stops);
         durationMin = Math.ceil((distanceKm / 30) * 60);
      }
    } else {
       distanceKm = this.getHaversineTotal(pickupLat, pickupLng, dropoffLat, dropoffLng, stops);
       durationMin = Math.ceil((distanceKm / 30) * 60);
    }

    // Fallback default pricing if VehicleCategory is not setup
    let baseFare = 500;
    let perKm = 150;
    
    // Attempt to load from DB
    const category = await this.prisma.vehicleCategory.findUnique({ where: { name: categoryName } });
    if (category) {
       baseFare = category.baseFare;
       perKm = category.perKmRate;
    }

    // Basic Surge Logic: Count active drivers vs pending orders
    const activeRidersCount = await this.prisma.rider.count({ where: { status: 'Active' } });
    const pendingOrdersCount = await this.prisma.order.count({ where: { status: 'Pending' } });

    let surgeMultiplier = 1.0;
    if (activeRidersCount > 0 && pendingOrdersCount > activeRidersCount) {
        surgeMultiplier = 1.5; // High demand
    } else if (activeRidersCount === 0) {
        surgeMultiplier = 2.0; // Extreme scarcity
    }

    let estimatedAmount = (baseFare + (distanceKm * perKm)) * surgeMultiplier;
    
    // Feature Modifiers
    if (options?.isInterstate) {
        estimatedAmount += 5000; // Flat interstate border fee
        estimatedAmount *= 1.2;  // Higher risk/duration multiplier
    }
    
    if (options?.isShared) {
        const seats = Math.max(1, options?.seats || 1);
        estimatedAmount = (estimatedAmount * 0.7) * seats; // 30% discount per seat
    } else if (options?.deliveryMode) {
        estimatedAmount = estimatedAmount * 0.85; // Delivery is slightly cheaper than passenger
    }
    
    // 1. Promo Logic
    if (promoCode) {
        const promo = await this.prisma.promoCode.findUnique({ where: { code: promoCode } });
        if (promo && promo.isActive && (!promo.maxUses || promo.usedCount < promo.maxUses)) {
             if (promo.discountPercent) {
                 estimatedAmount -= estimatedAmount * (promo.discountPercent / 100);
             } else if (promo.flatDiscount) {
                 estimatedAmount -= promo.flatDiscount;
             }
        }
    }

    // 2. Kogi Plus Loyalty Support
    if (options?.customerId) {
        const customer = await this.prisma.customer.findUnique({ where: { id: options.customerId } });
        if (customer?.isKogiPlus && customer.plusExpiry && customer.plusExpiry > new Date()) {
            estimatedAmount *= 0.9;
        }
    }

    return {
       distanceKm: Number(distanceKm.toFixed(2)),
       durationMin,
       estimatedAmount: Math.max(baseFare, Number(estimatedAmount.toFixed(2))), // Minimum fare guarantee
       surgeMultiplier,
       polyline,
       currency: 'NGN',
       isPlusBenefit: !!(options?.customerId)
    };
  }

  async findAllCategories() {
    return this.prisma.vehicleCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(data: any) {
    return this.prisma.vehicleCategory.create({
      data: {
        name: data.name,
        baseFare: parseFloat(data.baseFare),
        perKmRate: parseFloat(data.perKmRate),
        perMinRate: parseFloat(data.perMinRate || 0),
        capacity: parseInt(data.capacity || 4),
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateCategory(id: string, data: any) {
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.baseFare !== undefined) updateData.baseFare = parseFloat(data.baseFare);
    if (data.perKmRate !== undefined) updateData.perKmRate = parseFloat(data.perKmRate);
    if (data.perMinRate !== undefined) updateData.perMinRate = parseFloat(data.perMinRate);
    if (data.capacity !== undefined) updateData.capacity = parseInt(data.capacity);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.prisma.vehicleCategory.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteCategory(id: string) {
    return this.prisma.vehicleCategory.delete({
      where: { id },
    });
  }
}
