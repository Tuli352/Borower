import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RidePreferencesService {
  private readonly logger = new Logger(RidePreferencesService.name);

  constructor(private prisma: PrismaService) {}

  // Get user's ride preferences
  async getUserPreferences(userId: string, userType: 'customer' | 'rider') {
    try {
      if (userType === 'customer') {
        const customer = await (this.prisma as any).customer.findUnique({
          where: { id: userId },
          select: { ridePreferences: true }
        });

        if (!customer) {
          throw new NotFoundException('Customer not found');
        }

        return {
          preferences: customer.ridePreferences ? JSON.parse(customer.ridePreferences) : this.getDefaultCustomerPreferences(),
          isDefault: !customer.ridePreferences
        };
      } else {
        const rider = await (this.prisma as any).rider.findUnique({
          where: { id: userId },
          select: { ridePreferences: true }
        });

        if (!rider) {
          throw new NotFoundException('Rider not found');
        }

        return {
          preferences: rider.ridePreferences ? JSON.parse(rider.ridePreferences) : this.getDefaultRiderPreferences(),
          isDefault: !rider.ridePreferences
        };
      }
    } catch (error) {
      this.logger.error(`Failed to get user preferences: ${error.message}`);
      throw error;
    }
  }

  // Update user's ride preferences
  async updatePreferences(userId: string, userType: 'customer' | 'rider', preferences: any) {
    try {
      // Validate preferences
      const validatedPreferences = this.validatePreferences(preferences, userType);

      if (userType === 'customer') {
        await (this.prisma as any).customer.update({
          where: { id: userId },
          data: {
            ridePreferences: JSON.stringify(validatedPreferences),
            updatedAt: new Date()
          }
        });
      } else {
        await (this.prisma as any).rider.update({
          where: { id: userId },
          data: {
            ridePreferences: JSON.stringify(validatedPreferences),
            updatedAt: new Date()
          }
        });
      }

      this.logger.log(`Updated ${userType} preferences for user ${userId}`);

      return {
        success: true,
        message: 'Preferences updated successfully',
        preferences: validatedPreferences
      };
    } catch (error) {
      this.logger.error(`Failed to update preferences: ${error.message}`);
      throw error;
    }
  }

  // Apply preferences to order creation
  async applyPreferencesToOrder(userId: string, userType: 'customer' | 'rider', orderData: any) {
    const userPrefs = await this.getUserPreferences(userId, userType);
    const preferences = userPrefs.preferences;

    // Apply vehicle preference
    if (preferences.vehicleType && !orderData.vehiclePreference) {
      orderData.vehiclePreference = preferences.vehicleType;
    }

    // Apply customer-specific preferences
    if (userType === 'customer') {
      // Apply temperature preference
      if (preferences.temperature) {
        orderData.ridePreferences = {
          ...orderData.ridePreferences,
          temperature: preferences.temperature
        };
      }

      // Apply music preference
      if (preferences.music !== undefined) {
        orderData.ridePreferences = {
          ...orderData.ridePreferences,
          music: preferences.music
        };
      }

      // Apply conversation preference
      if (preferences.conversation !== undefined) {
        orderData.ridePreferences = {
          ...orderData.ridePreferences,
          conversation: preferences.conversation
        };
      }

      // Apply pet preference
      if (preferences.petsAllowed !== undefined) {
        orderData.ridePreferences = {
          ...orderData.ridePreferences,
          petsAllowed: preferences.petsAllowed
        };
      }

      // Apply smoking preference
      if (preferences.smokingAllowed !== undefined) {
        orderData.ridePreferences = {
          ...orderData.ridePreferences,
          smokingAllowed: preferences.smokingAllowed
        };
      }

      // Apply accessibility needs
      if (preferences.accessibilityNeeds) {
        orderData.ridePreferences = {
          ...orderData.ridePreferences,
          accessibilityNeeds: preferences.accessibilityNeeds
        };
      }

      // Apply luggage preference
      if (preferences.luggageSpace) {
        orderData.ridePreferences = {
          ...orderData.ridePreferences,
          luggageSpace: preferences.luggageSpace
        };
      }
    }

    // Apply rider-specific preferences
    if (userType === 'rider') {
      // Apply preferred areas
      if (preferences.preferredAreas && preferences.preferredAreas.length > 0) {
        orderData.preferredAreas = preferences.preferredAreas;
      }

      // Apply avoided areas
      if (preferences.avoidedAreas && preferences.avoidedAreas.length > 0) {
        orderData.avoidedAreas = preferences.avoidedAreas;
      }

      // Apply work schedule
      if (preferences.workSchedule) {
        orderData.workSchedule = preferences.workSchedule;
      }

      // Apply maximum trip distance
      if (preferences.maxTripDistance) {
        orderData.maxTripDistance = preferences.maxTripDistance;
      }

      // Apply payment preferences
      if (preferences.paymentMethods) {
        orderData.paymentMethods = preferences.paymentMethods;
      }
    }

    return orderData;
  }

  // Validate preferences
  private validatePreferences(preferences: any, userType: 'customer' | 'rider') {
    const validated: any = {};

    if (userType === 'customer') {
      // Validate customer preferences
      if (preferences.vehicleType) {
        const validVehicles = ['car', 'motorcycle', 'premium', 'suv', 'van'];
        if (!validVehicles.includes(preferences.vehicleType)) {
          throw new BadRequestException('Invalid vehicle type');
        }
        validated.vehicleType = preferences.vehicleType;
      }

      if (preferences.temperature !== undefined) {
        const validTemps = ['cool', 'warm', 'neutral'];
        if (!validTemps.includes(preferences.temperature)) {
          throw new BadRequestException('Invalid temperature preference');
        }
        validated.temperature = preferences.temperature;
      }

      if (preferences.music !== undefined) {
        if (typeof preferences.music !== 'boolean') {
          throw new BadRequestException('Music preference must be boolean');
        }
        validated.music = preferences.music;
      }

      if (preferences.conversation !== undefined) {
        if (typeof preferences.conversation !== 'boolean') {
          throw new BadRequestException('Conversation preference must be boolean');
        }
        validated.conversation = preferences.conversation;
      }

      if (preferences.petsAllowed !== undefined) {
        if (typeof preferences.petsAllowed !== 'boolean') {
          throw new BadRequestException('Pets preference must be boolean');
        }
        validated.petsAllowed = preferences.petsAllowed;
      }

      if (preferences.smokingAllowed !== undefined) {
        if (typeof preferences.smokingAllowed !== 'boolean') {
          throw new BadRequestException('Smoking preference must be boolean');
        }
        validated.smokingAllowed = preferences.smokingAllowed;
      }

      if (preferences.accessibilityNeeds) {
        if (!Array.isArray(preferences.accessibilityNeeds)) {
          throw new BadRequestException('Accessibility needs must be an array');
        }
        validated.accessibilityNeeds = preferences.accessibilityNeeds;
      }

      if (preferences.luggageSpace) {
        const validLuggage = ['small', 'medium', 'large', 'extra_large'];
        if (!validLuggage.includes(preferences.luggageSpace)) {
          throw new BadRequestException('Invalid luggage space preference');
        }
        validated.luggageSpace = preferences.luggageSpace;
      }
    } else {
      // Validate rider preferences
      if (preferences.preferredAreas) {
        if (!Array.isArray(preferences.preferredAreas)) {
          throw new BadRequestException('Preferred areas must be an array');
        }
        validated.preferredAreas = preferences.preferredAreas;
      }

      if (preferences.avoidedAreas) {
        if (!Array.isArray(preferences.avoidedAreas)) {
          throw new BadRequestException('Avoided areas must be an array');
        }
        validated.avoidedAreas = preferences.avoidedAreas;
      }

      if (preferences.workSchedule) {
        if (typeof preferences.workSchedule !== 'object') {
          throw new BadRequestException('Work schedule must be an object');
        }
        validated.workSchedule = preferences.workSchedule;
      }

      if (preferences.maxTripDistance) {
        if (typeof preferences.maxTripDistance !== 'number' || preferences.maxTripDistance <= 0) {
          throw new BadRequestException('Max trip distance must be a positive number');
        }
        validated.maxTripDistance = preferences.maxTripDistance;
      }

      if (preferences.paymentMethods) {
        if (!Array.isArray(preferences.paymentMethods)) {
          throw new BadRequestException('Payment methods must be an array');
        }
        validated.paymentMethods = preferences.paymentMethods;
      }
    }

    return validated;
  }

  // Get default customer preferences
  private getDefaultCustomerPreferences() {
    return {
      vehicleType: 'car',
      temperature: 'neutral',
      music: false,
      conversation: true,
      petsAllowed: false,
      smokingAllowed: false,
      accessibilityNeeds: [],
      luggageSpace: 'medium',
      notifications: {
        rideUpdates: true,
        promotionalOffers: true,
        safetyAlerts: true
      }
    };
  }

  // Get default rider preferences
  private getDefaultRiderPreferences() {
    return {
      preferredAreas: [],
      avoidedAreas: [],
      workSchedule: {
        monday: { start: '08:00', end: '20:00' },
        tuesday: { start: '08:00', end: '20:00' },
        wednesday: { start: '08:00', end: '20:00' },
        thursday: { start: '08:00', end: '20:00' },
        friday: { start: '08:00', end: '20:00' },
        saturday: { start: '10:00', end: '22:00' },
        sunday: { start: '10:00', end: '20:00' }
      },
      maxTripDistance: 50, // km
      paymentMethods: ['wallet', 'bank_transfer'],
      notifications: {
        rideRequests: true,
        earnings: true,
        promotions: true
      }
    };
  }

  // Reset preferences to default
  async resetPreferences(userId: string, userType: 'customer' | 'rider') {
    const defaultPreferences = userType === 'customer' ? 
      this.getDefaultCustomerPreferences() : 
      this.getDefaultRiderPreferences();

    return this.updatePreferences(userId, userType, defaultPreferences);
  }

  // Get preference statistics
  async getPreferenceStatistics() {
    try {
      const [
        customerPreferences,
        riderPreferences,
        vehicleTypeStats,
        temperatureStats
      ] = await Promise.all([
        this.getCustomerPreferenceStats(),
        this.getRiderPreferenceStats(),
        this.getVehicleTypeStats(),
        this.getTemperatureStats()
      ]);

      return {
        customerPreferences,
        riderPreferences,
        vehicleTypeStats,
        temperatureStats
      };
    } catch (error) {
      this.logger.error(`Failed to get preference statistics: ${error.message}`);
      throw error;
    }
  }

  // Get customer preference statistics
  private async getCustomerPreferenceStats() {
    const customers = await (this.prisma as any).customer.findMany({
      where: { ridePreferences: { not: null } },
      select: { id: true, name: true, ridePreferences: true }
    });

    const stats = {
      totalCustomersWithPreferences: customers.length,
      vehicleTypeDistribution: {} as Record<string, number>,
      temperatureDistribution: {} as Record<string, number>,
      musicPreference: { enabled: 0, disabled: 0 },
      conversationPreference: { enabled: 0, disabled: 0 },
      petsAllowed: { allowed: 0, notAllowed: 0 }
    };

    customers.forEach((customer: any) => {
      try {
        const prefs = JSON.parse(customer.ridePreferences || '{}');

        // Vehicle type distribution
        if (prefs.vehicleType) {
          stats.vehicleTypeDistribution[prefs.vehicleType] = 
            (stats.vehicleTypeDistribution[prefs.vehicleType] || 0) + 1;
        }

        // Temperature distribution
        if (prefs.temperature) {
          stats.temperatureDistribution[prefs.temperature] = 
            (stats.temperatureDistribution[prefs.temperature] || 0) + 1;
        }

        // Music preference
        if (prefs.music !== undefined) {
          if (prefs.music) {
            stats.musicPreference.enabled++;
          } else {
            stats.musicPreference.disabled++;
          }
        }

        // Conversation preference
        if (prefs.conversation !== undefined) {
          if (prefs.conversation) {
            stats.conversationPreference.enabled++;
          } else {
            stats.conversationPreference.disabled++;
          }
        }

        // Pets preference
        if (prefs.petsAllowed !== undefined) {
          if (prefs.petsAllowed) {
            stats.petsAllowed.allowed++;
          } else {
            stats.petsAllowed.notAllowed++;
          }
        }
      } catch (error) {
        // Skip invalid JSON
      }
    });

    return stats;
  }

  // Get rider preference statistics
  private async getRiderPreferenceStats() {
    const riders = await (this.prisma as any).rider.findMany({
      where: { ridePreferences: { not: null } },
      select: { id: true, name: true, ridePreferences: true }
    });

    const stats = {
      totalRidersWithPreferences: riders.length,
      averageMaxTripDistance: 0,
      paymentMethodDistribution: {} as Record<string, number>,
      workScheduleStats: {
        averageWorkHours: 0,
        mostActiveDay: '',
        leastActiveDay: ''
      }
    };

    let totalDistance = 0;
    const paymentMethods: Record<string, number> = {};
    const dayHours: Record<string, number[]> = {};

    riders.forEach((rider: any) => {
      try {
        const prefs = JSON.parse(rider.ridePreferences);

        // Max trip distance
        if (prefs.maxTripDistance) {
          totalDistance += prefs.maxTripDistance;
        }

        // Payment methods
        if (prefs.paymentMethods && Array.isArray(prefs.paymentMethods)) {
          prefs.paymentMethods.forEach((method: string) => {
            paymentMethods[method] = (paymentMethods[method] || 0) + 1;
          });
        }

        // Work schedule
        if (prefs.workSchedule && typeof prefs.workSchedule === 'object') {
          Object.entries(prefs.workSchedule).forEach(([day, schedule]: [string, any]) => {
            if (schedule.start && schedule.end) {
              const start = this.timeToMinutes(schedule.start);
              const end = this.timeToMinutes(schedule.end);
              const hours = (end - start) / 60;

              if (!dayHours[day]) {
                dayHours[day] = [];
              }
              dayHours[day].push(hours);
            }
          });
        }
      } catch (error) {
        // Skip invalid JSON
      }
    });

    stats.averageMaxTripDistance = riders.length > 0 ? totalDistance / riders.length : 0;
    stats.paymentMethodDistribution = paymentMethods;

    // Calculate work schedule stats
    const avgHours: Record<string, number> = {};
    Object.entries(dayHours).forEach(([day, hours]) => {
      avgHours[day] = hours.reduce((sum, h) => sum + h, 0) / hours.length;
    });

    const sortedDays = Object.entries(avgHours).sort(([, a], [, b]) => b - a);
    stats.workScheduleStats.averageWorkHours = Object.values(avgHours).reduce((sum, h) => sum + h, 0) / Object.keys(avgHours).length;
    stats.workScheduleStats.mostActiveDay = sortedDays[0]?.[0] || '';
    stats.workScheduleStats.leastActiveDay = sortedDays[sortedDays.length - 1]?.[0] || '';

    return stats;
  }

  // Get vehicle type statistics
  private async getVehicleTypeStats() {
    const orders = await (this.prisma as any).order.findMany({
      where: { vehiclePreference: { not: null } },
      select: { vehiclePreference: true }
    });

    const distribution: Record<string, number> = {};
    orders.forEach((order: any) => {
      if (order.vehiclePreference) {
        distribution[order.vehiclePreference] = (distribution[order.vehiclePreference] || 0) + 1;
      }
    });

    return distribution;
  }

  // Get temperature statistics
  private async getTemperatureStats() {
    const orders = await (this.prisma as any).order.findMany({
      where: { ridePreferences: { not: null } },
      select: { ridePreferences: true }
    });

    const distribution: Record<string, number> = {};
    orders.forEach((order: any) => {
      try {
        const prefs = JSON.parse(order.ridePreferences || '{}');
        if (prefs.temperature) {
          distribution[prefs.temperature] = (distribution[prefs.temperature] || 0) + 1;
        }
      } catch (error) {
        // Skip invalid JSON
      }
    });

    return distribution;
  }

  // Helper method to convert time string to minutes
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Get available preference options
  getAvailablePreferences() {
    return {
      customer: {
        vehicleType: ['car', 'motorcycle', 'premium', 'suv', 'van'],
        temperature: ['cool', 'warm', 'neutral'],
        luggageSpace: ['small', 'medium', 'large', 'extra_large'],
        accessibilityNeeds: ['wheelchair_access', 'hearing_impaired', 'visually_impaired', 'elderly_assistance']
      },
      rider: {
        paymentMethods: ['wallet', 'bank_transfer', 'cash', 'crypto'],
        maxTripDistanceRange: { min: 5, max: 100 }
      }
    };
  }
}
