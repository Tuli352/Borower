import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Injectable()
export class CancellationService {
  private readonly logger = new Logger(CancellationService.name);

  constructor(
    private prisma: PrismaService,
    private paymentsService: PaymentsService,
    private notificationsService: NotificationsService,
    private trackingGateway: TrackingGateway,
  ) {}

  // Cancel an order with penalties and refunds
  async cancelOrder(orderId: string, cancelledBy: 'customer' | 'rider' | 'admin', reason: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, rider: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check if order can be cancelled
    if (['Completed', 'Cancelled'].includes(order.status)) {
      throw new BadRequestException('Order cannot be cancelled at this stage');
    }

    // Calculate cancellation penalty
    const penalty = await this.calculateCancellationPenalty(order, cancelledBy);
    
    // Process refund if applicable
    let refundAmount = 0;
    if (order.amount > 0 && cancelledBy === 'rider') {
      refundAmount = order.amount - penalty;
    } else if (cancelledBy === 'customer') {
      refundAmount = order.amount - penalty;
    }

    // Update order status
    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'Cancelled',
        // Add cancellation metadata
        cancelledBy,
        cancelledAt: new Date(),
        cancellationReason: reason,
        cancellationPenalty: penalty,
        refundAmount,
      },
    });

    // Process financial transactions
    if (refundAmount > 0) {
      await this.processRefund(order, refundAmount, cancelledBy);
    }

    if (penalty > 0) {
      await this.processPenalty(order, penalty, cancelledBy);
    }

    // Update user statistics
    await this.updateCancellationStats(cancelledBy, userId, order);

    // Send notifications
    await this.sendCancellationNotifications(order, cancelledBy, reason, penalty, refundAmount);

    // Update dispatch if applicable
    if (order.status !== 'Pending') {
      await this.updateDispatchOnCancellation(orderId);
    }

    this.logger.log(`Order ${orderId} cancelled by ${cancelledBy}. Penalty: ₦${penalty}, Refund: ₦${refundAmount}`);
    
    return {
      success: true,
      order: updatedOrder,
      penalty,
      refundAmount,
      message: this.getCancellationMessage(cancelledBy, penalty, refundAmount),
    };
  }

  // Calculate cancellation penalty based on timing and user
  private async calculateCancellationPenalty(order: any, cancelledBy: string): Promise<number> {
    const now = new Date();
    const orderCreated = new Date(order.createdAt);
    const timeDiffMinutes = (now.getTime() - orderCreated.getTime()) / (1000 * 60);

    // Base penalty rules
    if (cancelledBy === 'customer') {
      // Customer cancellation penalties
      if (timeDiffMinutes < 2) {
        return 0; // No penalty for quick cancellation (within 2 minutes)
      } else if (timeDiffMinutes < 5) {
        return Math.min(order.amount * 0.1, 200); // 10% or ₦200 max
      } else if (order.status === 'Accepted' || order.status === 'OnWay') {
        return Math.min(order.amount * 0.25, 500); // 25% or ₦500 max if rider assigned
      } else {
        return Math.min(order.amount * 0.15, 300); // 15% or ₦300 max
      }
    } else if (cancelledBy === 'rider') {
      // Rider cancellation penalties (stricter)
      if (order.status === 'Accepted') {
        return Math.min(order.amount * 0.3, 600); // 30% or ₦600 max
      } else if (order.status === 'OnWay') {
        return Math.min(order.amount * 0.5, 1000); // 50% or ₦1000 max
      } else {
        return Math.min(order.amount * 0.2, 400); // 20% or ₦400 max
      }
    }

    return 0; // Admin cancellation has no penalty
  }

  // Process refund to customer wallet or original payment method
  private async processRefund(order: any, refundAmount: number, cancelledBy: string) {
    try {
      // Refund to customer wallet
      await this.prisma.customer.update({
        where: { id: order.customerId },
        data: { walletBalance: { increment: refundAmount } },
      });

      // Create refund transaction
      await this.prisma.transaction.create({
        data: {
          reference: `REFUND-${order.id}-${Date.now()}`,
          user: order.customer.name || order.customer.email,
          customerId: order.customerId,
          type: 'Refund',
          amount: refundAmount,
          status: 'Completed',
          method: 'Wallet Credit',
          description: `Refund for cancelled order ${order.id}`,
          date: new Date(),
        },
      });

      this.logger.log(`Refunded ₦${refundAmount} to customer ${order.customerId} for cancelled order ${order.id}`);
    } catch (error) {
      this.logger.error(`Failed to process refund for order ${order.id}: ${error.message}`);
      throw error;
    }
  }

  // Process penalty deduction
  private async processPenalty(order: any, penalty: number, cancelledBy: string) {
    try {
      if (cancelledBy === 'customer') {
        // Deduct from customer wallet
        await this.prisma.customer.update({
          where: { id: order.customerId },
          data: { walletBalance: { decrement: penalty } },
        });

        // Create penalty transaction
        await this.prisma.transaction.create({
          data: {
            reference: `PENALTY-${order.id}-${Date.now()}`,
            user: order.customer.name || order.customer.email,
            customerId: order.customerId,
            type: 'Penalty',
            amount: penalty,
            status: 'Completed',
            method: 'Wallet Deduction',
            description: `Cancellation penalty for order ${order.id}`,
            date: new Date(),
          },
        });
      } else if (cancelledBy === 'rider') {
        // Deduct from rider wallet
        await this.prisma.rider.update({
          where: { id: order.riderId },
          data: { walletBalance: { decrement: penalty } },
        });

        // Create penalty transaction
        await this.prisma.transaction.create({
          data: {
            reference: `PENALTY-${order.id}-${Date.now()}`,
            user: order.rider.name || order.rider.email,
            riderId: order.riderId,
            type: 'Penalty',
            amount: penalty,
            status: 'Completed',
            method: 'Wallet Deduction',
            description: `Cancellation penalty for order ${order.id}`,
            date: new Date(),
          },
        });
      }

      this.logger.log(`Applied ₦${penalty} penalty to ${cancelledBy} for cancelled order ${order.id}`);
    } catch (error) {
      this.logger.error(`Failed to process penalty for order ${order.id}: ${error.message}`);
    }
  }

  // Update user cancellation statistics
  private async updateCancellationStats(cancelledBy: string, userId: string, order: any) {
    try {
      if (cancelledBy === 'customer') {
        await this.prisma.customer.update({
          where: { id: userId },
          data: {
            // Add cancellation count (you'd need to add this field to schema)
            // For now, we'll just log it
          },
        });
      } else if (cancelledBy === 'rider') {
        await this.prisma.rider.update({
          where: { id: userId },
          data: {
            // Update rider rating based on cancellation
            rating: Math.max(1.0, (order.rider.rating || 5.0) - 0.1), // Decrease rating slightly
          },
        });
      }
    } catch (error) {
      this.logger.error(`Failed to update cancellation stats for ${cancelledBy} ${userId}: ${error.message}`);
    }
  }

  // Send cancellation notifications
  private async sendCancellationNotifications(order: any, cancelledBy: string, reason: string, penalty: number, refundAmount: number) {
    try {
      // Notify customer
      const customerNotification = await this.notificationsService.create({
        title: 'Order Cancelled',
        message: `Your order has been cancelled. ${refundAmount > 0 ? `₦${refundAmount} has been refunded to your wallet.` : ''} ${penalty > 0 ? `A cancellation fee of ₦${penalty} was applied.` : ''}`,
        type: 'ORDER_CANCELLED',
      });

      // Notify rider if involved
      if (order.riderId && cancelledBy !== 'rider') {
        const riderNotification = await this.notificationsService.create({
          title: 'Order Cancelled',
          message: `Order ${order.id} has been cancelled by the ${cancelledBy}.`,
          type: 'ORDER_CANCELLED',
        });

        this.trackingGateway.server.emit(`rider_notification_${order.riderId}`, riderNotification);
      }

      // Send WebSocket notifications
      this.trackingGateway.server.emit(`customer_notification_${order.customerId}`, customerNotification);
      
      this.logger.log(`Cancellation notifications sent for order ${order.id}`);
    } catch (error) {
      this.logger.error(`Failed to send cancellation notifications for order ${order.id}: ${error.message}`);
    }
  }

  // Update dispatch system on cancellation
  private async updateDispatchOnCancellation(orderId: string) {
    try {
      const rideRequest = await this.prisma.activeRideRequest.findUnique({
        where: { orderId },
      });

      if (rideRequest) {
        await this.prisma.activeRideRequest.update({
          where: { id: rideRequest.id },
          data: { status: 'CANCELLED' },
        });

        // Notify other riders who might have been offered the ride
        this.trackingGateway.server.emit(`order_cancelled_${orderId}`, {
          orderId,
          message: 'Order has been cancelled',
        });
      }
    } catch (error) {
      this.logger.error(`Failed to update dispatch for cancelled order ${orderId}: ${error.message}`);
    }
  }

  // Get cancellation message
  private getCancellationMessage(cancelledBy: string, penalty: number, refundAmount: number): string {
    if (cancelledBy === 'customer') {
      if (penalty > 0 && refundAmount > 0) {
        return `Order cancelled. ₦${refundAmount} refunded to your wallet. Cancellation fee of ₦${penalty} applied.`;
      } else if (penalty > 0) {
        return `Order cancelled. Cancellation fee of ₦${penalty} applied.`;
      } else {
        return `Order cancelled. Full refund of ₦${refundAmount} processed.`;
      }
    } else if (cancelledBy === 'rider') {
      return `Rider cancelled the order. Full refund of ₦${refundAmount} has been processed to your wallet.`;
    } else {
      return `Order cancelled by admin. Full refund of ₦${refundAmount} processed.`;
    }
  }

  // Get cancellation policy
  getCancellationPolicy() {
    return {
      customer: {
        within2Minutes: 'No cancellation fee',
        within5Minutes: '10% of fare (max ₦200)',
        afterRiderAssigned: '25% of fare (max ₦500)',
        other: '15% of fare (max ₦300)',
      },
      rider: {
        afterAcceptance: '30% of fare (max ₦600)',
        afterOnWay: '50% of fare (max ₦1000)',
        other: '20% of fare (max ₦400)',
      },
      note: 'Frequent cancellations may result in account suspension',
    };
  }

  // Check user cancellation history
  async getUserCancellationHistory(userId: string, userType: 'customer' | 'rider') {
    const model = userType === 'customer' ? this.prisma.customer : this.prisma.rider;
    
    // This would require adding cancellation history to the schema
    // For now, return basic info
    return {
      totalCancellations: 0, // Would be calculated from actual data
      recentCancellations: [],
      warningLevel: 'none',
    };
  }
}
