import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DispatchService } from '../dispatch/dispatch.service';

@Injectable()
export class ScheduledRidesService {
  private readonly logger = new Logger(ScheduledRidesService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private trackingGateway: TrackingGateway,
    private dispatchService: DispatchService,
  ) {}

  // Create a scheduled ride
  async createScheduledRide(data: {
    customerId: string;
    pickupLocation: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLocation: string;
    dropoffLat: number;
    dropoffLng: number;
    scheduledAt: Date;
    amount: number;
    stops?: any;
    vehiclePreference?: string;
    ridePreferences?: any;
  }) {
    try {
      // Validate scheduled time (must be at least 30 minutes in future)
      const now = new Date();
      const scheduledTime = new Date(data.scheduledAt);
      const minAdvanceTime = 30 * 60 * 1000; // 30 minutes in milliseconds

      if (scheduledTime.getTime() - now.getTime() < minAdvanceTime) {
        throw new BadRequestException('Rides must be scheduled at least 30 minutes in advance');
      }

      // Check for conflicting scheduled rides
      const conflictingRide = await this.prisma.order.findFirst({
        where: {
          customerId: data.customerId,
          status: { in: ['Pending', 'Accepted'] },
          scheduledAt: {
            gte: new Date(scheduledTime.getTime() - 60 * 60 * 1000), // 1 hour before
            lte: new Date(scheduledTime.getTime() + 60 * 60 * 1000), // 1 hour after
          }
        }
      });

      if (conflictingRide) {
        throw new BadRequestException('You have a conflicting scheduled ride within this time period');
      }

      // Create the scheduled order
      const scheduledRide = await this.prisma.order.create({
        data: {
          customerId: data.customerId,
          pickupLocation: data.pickupLocation,
          pickupLat: data.pickupLat,
          pickupLng: data.pickupLng,
          dropoffLocation: data.dropoffLocation,
          dropoffLat: data.dropoffLat,
          dropoffLng: data.dropoffLng,
          scheduledAt: scheduledTime,
          isScheduled: true,
          amount: data.amount,
          stops: data.stops ? JSON.stringify(data.stops) : null,
          vehiclePreference: data.vehiclePreference,
          ridePreferences: data.ridePreferences ? JSON.stringify(data.ridePreferences) : null,
          status: 'Scheduled',
          type: 'Ride',
        }
      });

      // Send confirmation notification
      await this.sendScheduledRideConfirmation(scheduledRide);

      this.logger.log(`Scheduled ride created: ${scheduledRide.id} for ${scheduledTime}`);
      
      return {
        success: true,
        ride: scheduledRide,
        message: `Ride scheduled for ${scheduledTime.toLocaleString()}`,
      };
    } catch (error) {
      this.logger.error(`Failed to create scheduled ride: ${error.message}`);
      throw error;
    }
  }

  // Get scheduled rides for a customer
  async getCustomerScheduledRides(customerId: string) {
    return await this.prisma.order.findMany({
      where: {
        customerId,
        isScheduled: true,
        scheduledAt: { gte: new Date() },
        status: { in: ['Scheduled', 'Pending', 'Accepted'] }
      },
      orderBy: { scheduledAt: 'asc' }
    });
  }

  // Get all scheduled rides (admin)
  async getAllScheduledRides(filters?: {
    date?: Date;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {
      isScheduled: true,
    };

    if (filters?.date) {
      const startOfDay = new Date(filters.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filters.date);
      endOfDay.setHours(23, 59, 59, 999);
      
      where.scheduledAt = {
        gte: startOfDay,
        lte: endOfDay
      };
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    return await this.prisma.order.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        rider: { select: { id: true, name: true, phone: true, rating: true } }
      },
      orderBy: { scheduledAt: 'asc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0
    });
  }

  // Update scheduled ride
  async updateScheduledRide(orderId: string, data: any, customerId: string) {
    const ride = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        customerId,
        isScheduled: true
      }
    });

    if (!ride) {
      throw new NotFoundException('Scheduled ride not found');
    }

    // Can only update if ride is still scheduled and not yet dispatched
    if (ride.status !== 'Scheduled') {
      throw new BadRequestException('Cannot update ride that is already being processed');
    }

    // Validate new scheduled time if provided
    if (data.scheduledAt) {
      const now = new Date();
      const scheduledTime = new Date(data.scheduledAt);
      const minAdvanceTime = 30 * 60 * 1000; // 30 minutes

      if (scheduledTime.getTime() - now.getTime() < minAdvanceTime) {
        throw new BadRequestException('Rides must be scheduled at least 30 minutes in advance');
      }
    }

    const updatedRide = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });

    // Send update notification
    await this.sendScheduledRideUpdate(updatedRide);

    return updatedRide;
  }

  // Cancel scheduled ride
  async cancelScheduledRide(orderId: string, customerId: string, reason: string) {
    const ride = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        customerId,
        isScheduled: true
      }
    });

    if (!ride) {
      throw new NotFoundException('Scheduled ride not found');
    }

    // Calculate refund based on cancellation time
    const now = new Date();
    const scheduledTime = new Date(ride.scheduledAt!);
    const hoursUntilRide = (scheduledTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    let refundAmount = ride.amount;
    let penalty = 0;

    if (hoursUntilRide < 2) {
      // Less than 2 hours: 50% refund
      refundAmount = ride.amount * 0.5;
      penalty = ride.amount * 0.5;
    } else if (hoursUntilRide < 6) {
      // Less than 6 hours: 75% refund
      refundAmount = ride.amount * 0.75;
      penalty = ride.amount * 0.25;
    }
    // More than 6 hours: Full refund

    // Update order
    const updatedRide = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'Cancelled',
        cancelledBy: 'customer',
        cancelledAt: new Date(),
        cancellationReason: reason,
        cancellationPenalty: penalty,
        refundAmount,
      }
    });

    // Process refund
    if (refundAmount > 0) {
      await this.prisma.customer.update({
        where: { id: customerId },
        data: { walletBalance: { increment: refundAmount } }
      });

      await this.prisma.transaction.create({
        data: {
          reference: `SCHEDULED-REFUND-${orderId}`,
          user: 'Customer', // Would need to fetch customer details
          customerId,
          type: 'Refund',
          amount: refundAmount,
          status: 'Completed',
          method: 'Wallet Credit',
          description: `Refund for cancelled scheduled ride ${orderId}`,
          date: new Date(),
        }
      });
    }

    // Send cancellation notification
    await this.sendScheduledRideCancellation(updatedRide, refundAmount, penalty);

    return {
      success: true,
      ride: updatedRide,
      refundAmount,
      penalty,
      message: `Scheduled ride cancelled. ₦${refundAmount} refunded to wallet.`
    };
  }

  // Cron job to process scheduled rides
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledRides() {
    const now = new Date();
    const dispatchWindow = 15 * 60 * 1000; // 15 minutes before scheduled time

    try {
      // Find rides that need to be dispatched (15 minutes before scheduled time)
      const ridesToDispatch = await this.prisma.order.findMany({
        where: {
          isScheduled: true,
          status: 'Scheduled',
          scheduledAt: {
            lte: new Date(now.getTime() + dispatchWindow),
            gte: new Date(now.getTime() - 5 * 60 * 1000) // Within last 5 minutes (in case of missed processing)
          }
        },
        include: { customer: true }
      });

      for (const ride of ridesToDispatch) {
        await this.dispatchScheduledRide(ride);
      }

      // Find rides that are past scheduled time and still not dispatched
      const overdueRides = await this.prisma.order.findMany({
        where: {
          isScheduled: true,
          status: 'Scheduled',
          scheduledAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } // More than 5 minutes overdue
        },
        include: { customer: true }
      });

      for (const ride of overdueRides) {
        await this.handleOverdueScheduledRide(ride);
      }

    } catch (error) {
      this.logger.error(`Error processing scheduled rides: ${error.message}`);
    }
  }

  // Dispatch a scheduled ride
  private async dispatchScheduledRide(ride: any) {
    try {
      // Update status to Pending (ready for dispatch)
      await this.prisma.order.update({
        where: { id: ride.id },
        data: { status: 'Pending' }
      });

      // Start dispatch process
      await this.dispatchService.findOffersForRequest(ride.id);

      // Send notification to customer
      const notification = await this.notificationsService.create({
        title: 'Scheduled Ride Dispatch Started',
        message: `Your scheduled ride for ${ride.scheduledAt.toLocaleString()} is now being dispatched to nearby riders.`,
        type: 'SCHEDULED_RIDE_DISPATCH',
      });

      this.trackingGateway.server.emit(`customer_notification_${ride.customerId}`, notification);

      this.logger.log(`Scheduled ride ${ride.id} dispatched to riders`);
    } catch (error) {
      this.logger.error(`Failed to dispatch scheduled ride ${ride.id}: ${error.message}`);
    }
  }

  // Handle overdue scheduled rides
  private async handleOverdueScheduledRide(ride: any) {
    try {
      // Mark as failed and refund customer
      await this.prisma.order.update({
        where: { id: ride.id },
        data: {
          status: 'No Riders Available',
          cancelledBy: 'admin',
          cancelledAt: new Date(),
          cancellationReason: 'No riders available at scheduled time',
          refundAmount: ride.amount,
        }
      });

      // Process full refund
      await this.prisma.customer.update({
        where: { id: ride.customerId },
        data: { walletBalance: { increment: ride.amount } }
      });

      await this.prisma.transaction.create({
        data: {
          reference: `SCHEDULED-FAILED-${ride.id}`,
          user: ride.customer.name || 'Customer',
          customerId: ride.customerId,
          type: 'Refund',
          amount: ride.amount,
          status: 'Completed',
          method: 'Wallet Credit',
          description: `Refund for failed scheduled ride ${ride.id}`,
          date: new Date(),
        }
      });

      // Send notification
      const notification = await this.notificationsService.create({
        title: 'Scheduled Ride Failed',
        message: `Unfortunately, no riders were available for your scheduled ride. Full refund has been processed to your wallet.`,
        type: 'SCHEDULED_RIDE_FAILED',
      });

      this.trackingGateway.server.emit(`customer_notification_${ride.customerId}`, notification);

      this.logger.log(`Scheduled ride ${ride.id} marked as failed - no riders available`);
    } catch (error) {
      this.logger.error(`Failed to handle overdue scheduled ride ${ride.id}: ${error.message}`);
    }
  }

  // Send scheduled ride confirmation
  private async sendScheduledRideConfirmation(ride: any) {
    const notification = await this.notificationsService.create({
      title: 'Ride Scheduled Successfully',
      message: `Your ride has been scheduled for ${ride.scheduledAt.toLocaleString()}. You will be notified when we start dispatching riders 15 minutes before your pickup time.`,
      type: 'SCHEDULED_RIDE_CONFIRMATION',
    });

    this.trackingGateway.server.emit(`customer_notification_${ride.customerId}`, notification);
  }

  // Send scheduled ride update
  private async sendScheduledRideUpdate(ride: any) {
    const notification = await this.notificationsService.create({
      title: 'Scheduled Ride Updated',
      message: `Your scheduled ride has been updated to ${ride.scheduledAt.toLocaleString()}.`,
      type: 'SCHEDULED_RIDE_UPDATE',
    });

    this.trackingGateway.server.emit(`customer_notification_${ride.customerId}`, notification);
  }

  // Send scheduled ride cancellation
  private async sendScheduledRideCancellation(ride: any, refundAmount: number, penalty: number) {
    let message = `Your scheduled ride for ${ride.scheduledAt.toLocaleString()} has been cancelled.`;
    
    if (refundAmount > 0) {
      message += ` ₦${refundAmount} has been refunded to your wallet.`;
    }
    
    if (penalty > 0) {
      message += ` A cancellation fee of ₦${penalty} was applied.`;
    }

    const notification = await this.notificationsService.create({
      title: 'Scheduled Ride Cancelled',
      message,
      type: 'SCHEDULED_RIDE_CANCELLED',
    });

    this.trackingGateway.server.emit(`customer_notification_${ride.customerId}`, notification);
  }

  // Get scheduled ride statistics
  async getScheduledRidesStatistics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const totalToday = await this.prisma.order.count({
      where: {
        isScheduled: true,
        scheduledAt: {
          gte: today,
          lt: tomorrow
        }
      }
    });

    const upcoming = await this.prisma.order.count({
      where: {
        isScheduled: true,
        scheduledAt: { gte: new Date() },
        status: { in: ['Scheduled', 'Pending', 'Accepted'] }
      }
    });

    const completed = await this.prisma.order.count({
      where: {
        isScheduled: true,
        status: 'Completed'
      }
    });

    const cancelled = await this.prisma.order.count({
      where: {
        isScheduled: true,
        status: 'Cancelled'
      }
    });

    return {
      totalToday,
      upcoming,
      completed,
      cancelled,
      completionRate: (completed + cancelled) > 0 ? ((completed / (completed + cancelled)) * 100).toFixed(1) : '0'
    };
  }
}
