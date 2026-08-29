import { Injectable, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { DispatchService } from '../dispatch/dispatch.service';
import axios from 'axios';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private static readonly NO_SHOW_TIMEOUT_MINUTES = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly trackingGateway: TrackingGateway,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => DispatchService))
    private readonly dispatchService: DispatchService,
  ) {}

  async findAll() {
    const orders = await this.prisma.order.findMany({
      include: {
        customer: true,
        rider: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.id.slice(0, 8).toUpperCase(),
      customer: order.customer.name,
      rider: order.rider ? order.rider.name : 'Unassigned',
      status: order.status,
      type: (order as any).type,
      restaurant: (order as any).restaurantName || 'N/A',
      amount: order.amount,
      pickup: order.pickupLocation,
      dropoff: order.dropoffLocation,
      date: order.createdAt.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    }));
  }

  async findScheduled() {
    const orders = await this.prisma.order.findMany({
      where: {
        isScheduled: true,
      },
      include: {
        customer: true,
        rider: true,
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    });

    return orders.map((order) => ({
      id: order.id,
      passenger: order.customer?.name || 'Unknown',
      phone: order.customer?.phone || 'Unknown',
      pickup: order.pickupLocation,
      dropoff: order.dropoffLocation,
      scheduledDate: order.scheduledAt ? order.scheduledAt.toISOString().split('T')[0] : 'N/A',
      scheduledTime: order.scheduledAt ? order.scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A',
      vehicleType: (order as any).vehicleType || 'Standard',
      fare: order.amount,
      status: order.status === 'Completed' ? 'completed' 
            : order.status === 'Cancelled' ? 'cancelled' 
            : order.riderId ? 'assigned' : 'upcoming',
      driver: order.rider?.name || null,
      recurring: false, // Or map to a DB field if it exists
    }));
  }

  private async geocodeAddressNominatim(address: string): Promise<{ lat: number; lng: number }> {
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          format: 'json',
          q: address,
          limit: 1,
        },
        headers: {
          'User-Agent': 'KogiRiderBackend/1.0',
        },
      });

      if (response.data && response.data.length > 0) {
        const item = response.data[0];
        return {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        };
      }
    } catch (error) {
      console.error(`Nominatim fallback geocoding failed for "${address}":`, error.message);
    }
    // Return Lokoja default as safe fallback
    return { lat: 7.8023, lng: 6.7333 };
  }

  async createRideOrder(customerId: string, data: { pickupLocation: string; dropoffLocation: string; amount: number; stops?: any; pickupLat?: number; pickupLng?: number; dropoffLat?: number; dropoffLng?: number; scheduledAt?: string | Date; targetRiderId?: string }) {
    try {
      let pickupLat = data.pickupLat;
      let pickupLng = data.pickupLng;
      let dropoffLat = data.dropoffLat;
      let dropoffLng = data.dropoffLng;

      // Fallback to Nominatim geocoding if coordinates are missing/zero
      if (!pickupLat || !pickupLng || pickupLat === 0 || pickupLng === 0) {
        const coords = await this.geocodeAddressNominatim(data.pickupLocation);
        pickupLat = coords.lat;
        pickupLng = coords.lng;
      }

      if (!dropoffLat || !dropoffLng || dropoffLat === 0 || dropoffLng === 0) {
        const coords = await this.geocodeAddressNominatim(data.dropoffLocation);
        dropoffLat = coords.lat;
        dropoffLng = coords.lng;
      }

      const order = await this.prisma.order.create({
        data: {
          customerId,
          pickupLocation: data.pickupLocation,
          dropoffLocation: data.dropoffLocation,
          pickupLat,
          pickupLng,
          dropoffLat,
          dropoffLng,
          amount: data.amount,
          status: data.scheduledAt ? 'Scheduled' : 'Pending',
          type: 'Ride',
          isScheduled: !!data.scheduledAt,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          stops: data.stops ? JSON.stringify(data.stops) : null,
          commission: data.amount * 0.15, // 15% platform fee
        },
        include: {
          customer: true,
        },
      });

      // Emit to Admin
      this.trackingGateway.server.emit('admin_new_order', order);
      
      // Trigger dispatch immediately if not scheduled
      if (!data.scheduledAt) {
        this.dispatchService.findOffersForRequest(order.id, data.targetRiderId);
      }
      
      return order;
    } catch (error) {
      if (error.code === 'P2003') {
        throw new BadRequestException('Invalid customer ID. Please ensure you are logged in as a Customer.');
      }
      throw error;
    }
  }

  async createFoodOrder(customerId: string, data: { vendorId: string; pickupLocation: string; dropoffLocation: string; items: { menuItemId: string; quantity: number }[] }) {
    try {
      // 1. Fetch item prices
      const itemIds = data.items.map(i => i.menuItemId);
      const menuItems = await this.prisma.menuItem.findMany({
        where: { id: { in: itemIds } }
      });

      // 2. Calculate Total
      let totalAmount = 0;
      const orderItemsData = data.items.map(item => {
        const menuItem = menuItems.find(mi => mi.id === item.menuItemId);
        if (!menuItem) throw new BadRequestException(`Menu item ${item.menuItemId} not found`);
        const subtotal = menuItem.price * item.quantity;
        totalAmount += subtotal;
        return {
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          price: menuItem.price
        };
      });

      const vendor = await this.prisma.vendor.findUnique({ where: { id: data.vendorId } });

      const order = await this.prisma.order.create({
        data: {
          customerId,
          restaurantName: vendor ? vendor.companyName : 'Unknown Vendor',
          pickupLocation: data.pickupLocation,
          dropoffLocation: data.dropoffLocation,
          amount: totalAmount,
          status: 'Pending',
          type: 'Food',
          deliveryCode: Math.floor(1000 + Math.random() * 9000).toString(), // 4-digit verification code
          commission: totalAmount * 0.15,
          orderItems: {
            create: orderItemsData
          }
        },
        include: {
          customer: true,
          orderItems: {
            include: { menuItem: true }
          }
        },
      });

      // Emit to Admin
      this.trackingGateway.server.emit('admin_new_order', order);

      return order;
    } catch (error) {
      if (error.code === 'P2003') {
        throw new BadRequestException('Invalid IDs. Please check customer and vendor data.');
      }
      throw error;
    }
  }

  async findMyRides(customerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      include: {
        rider: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.id.slice(0, 8).toUpperCase(),
      rider: order.rider ? order.rider.name : 'Unassigned',
      status: order.status,
      type: (order as any).type,
      restaurant: (order as any).restaurantName || 'N/A',
      amount: `$${order.amount.toFixed(2)}`,
      pickup: order.pickupLocation,
      dropoff: order.dropoffLocation,
      date: order.createdAt.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    }));
  }

  async findOne(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        rider: true,
      },
    });
  }

  async updateStatus(id: string, status: string, riderId?: string, verificationCode?: string) {
    try {
      const order = await this.prisma.order.findUnique({ where: { id } });
      if (!order) throw new BadRequestException('Order not found');

      // Proof of Delivery Verification
      if (status === 'Completed' && order.deliveryCode) {
        if (!verificationCode) {
          throw new BadRequestException('Verification code is required to complete this delivery.');
        }
        if (order.deliveryCode !== verificationCode) {
          throw new BadRequestException('Invalid verification code. Please ask the customer for their 4-digit code.');
        }
      }

      let finalStatus = status;
      if (status === 'Completed' && order.type === 'Ride') {
        finalStatus = 'PaymentPending';
      }

      const updateData: any = { status: finalStatus };
      if (riderId) {
        updateData.riderId = riderId;
      }
      // Track when driver arrives at pickup for no-show timer
      if (status === 'Arrived' || status === 'DriverArrived') {
        updateData.arrivedAt = new Date();
      }
      const updatedOrder = await this.prisma.order.update({
        where: { id },
        data: updateData,
        include: {
          customer: true,
          rider: true
        }
      });

      // Notification & Referral Logic
      if (status === 'Completed' && updatedOrder.riderId && updatedOrder.type !== 'Ride') {
         // 1. Credit Rider Earnings & Update Streak
         const rider = await this.prisma.rider.findUnique({ where: { id: updatedOrder.riderId as string } });
         const now = new Date();
         let newStreak = 1;
         
         if (rider?.lastTripAt) {
           const hoursSinceLastTrip = (now.getTime() - rider.lastTripAt.getTime()) / (1000 * 60 * 60);
           if (hoursSinceLastTrip < 24) {
             newStreak = (rider.streak || 0) + 1;
           }
         }

         const riderEarnings = updatedOrder.amount * 0.85;
         const adminCommission = updatedOrder.amount * 0.15;

         await this.prisma.$transaction([
           // Update Rider
           this.prisma.rider.update({
              where: { id: updatedOrder.riderId as string },
              data: { 
                walletBalance: { increment: riderEarnings },
                earnings: { increment: riderEarnings },
                rides: { increment: 1 },
                streak: newStreak,
                lastTripAt: now
              }
           }),
           // Update Admin Wallet
           this.prisma.adminWallet.upsert({
              where: { id: 'kogi-admin-wallet' },
              create: {
                id: 'kogi-admin-wallet',
                balance: adminCommission,
                totalEarned: adminCommission
              },
              update: {
                balance: { increment: adminCommission },
                totalEarned: { increment: adminCommission }
              }
           }),
           // Log Admin Commission Transaction
           this.prisma.transaction.create({
             data: {
               reference: `COMM-${updatedOrder.id.substring(0,8)}-${Date.now()}`,
               type: 'Admin Commission',
               amount: adminCommission,
               status: 'Completed',
               method: 'Platform',
               description: `Commission from Order ${updatedOrder.id.substring(0,8)}`,
               adminWalletId: 'kogi-admin-wallet',
               orderId: updatedOrder.id
             }
           }),
           // Log Rider Earnings Transaction
           this.prisma.transaction.create({
             data: {
               reference: `EARN-${updatedOrder.id.substring(0,8)}-${Date.now()}`,
               type: 'Earnings',
               amount: riderEarnings,
               status: 'Completed',
               method: 'Platform',
               description: `Earnings (Card Trip ${updatedOrder.id.substring(0,8)})`,
               riderId: updatedOrder.riderId,
               orderId: updatedOrder.id
             }
           })
         ]);

         // Create Admin Notification for Commission
         const notification = await this.notificationsService.create({
           title: 'Platform Commission Earned',
           message: `You earned ₦${adminCommission.toLocaleString()} from Order #${updatedOrder.id.substring(0,8)} (Rider: ${updatedOrder.rider?.name || 'Unknown'})`,
           type: 'REVENUE'
         });
         this.trackingGateway.server.emit('admin_new_notification', notification);

         // 2. Check for Referral Bonus (First ride only)
         const customerRides = await this.prisma.order.count({
            where: { customerId: updatedOrder.customerId, status: 'Completed' }
         });

         if (customerRides === 1) {
            const customer = await this.prisma.customer.findUnique({
              where: { id: updatedOrder.customerId },
              include: { referredBy: true }
            });

            if (customer && customer.referredById) {
               // Credit referrer
               await this.prisma.customer.update({
                  where: { id: customer.referredById },
                  data: { walletBalance: { increment: 500 } } // 500 NGN Referral Bonus
               });

               // Log transaction
               await this.prisma.transaction.create({
                  data: {
                    reference: `REF-${Math.random().toString(36).substring(7).toUpperCase()}`,
                    type: 'Referral Bonus',
                    amount: 500,
                    status: 'Completed',
                    method: 'Wallet',
                    customerId: customer.referredById,
                    description: `Bonus for referring ${customer.name}`
                  }
               });
            }
         }
      }

      // 1. Notify Admin Dashboard
      this.trackingGateway.server.emit('admin_order_update', updatedOrder);

      // 2. Notify Customer (Live tracking room)
      this.trackingGateway.notifyOrderStatus(updatedOrder.id, updatedOrder.status, {
        rider: updatedOrder.rider ? {
          id: updatedOrder.rider.id,
          name: updatedOrder.rider.name,
          phone: updatedOrder.rider.phone,
          avatar: updatedOrder.rider.avatar,
          rating: updatedOrder.rider.rating,
          vehicle: updatedOrder.rider.vehicle,
          vehicleColor: updatedOrder.rider.vehicleColor,
          plateNumber: updatedOrder.rider.plateNumber,
        } : null,
      });

      // 3. Handle Active Ride Request cleanup
      // Mark as ACCEPTED when ride is accepted, and ensure it stays ACCEPTED
      // for ALL subsequent statuses so the dispatch system never re-offers this order.
      if (['Accepted', 'Arrived', 'DriverArrived', 'PickedUp', 'AtDropoff', 'PaymentPending'].includes(status)) {
        await this.prisma.activeRideRequest.updateMany({
          where: { orderId: updatedOrder.id, status: { not: 'ACCEPTED' } },
          data: { status: 'ACCEPTED', currentRiderId: riderId || updatedOrder.riderId }
        });
      }

      // On Completed, fully remove the ActiveRideRequest to keep the table clean
      if (status === 'Completed') {
        await this.prisma.activeRideRequest.deleteMany({
          where: { orderId: updatedOrder.id }
        });
      }

      if (status === 'Cancelled') {
        await this.prisma.activeRideRequest.updateMany({
          where: { orderId: updatedOrder.id },
          data: { status: 'CANCELLED' }
        });
        
        // Notify Rider if assigned
        if (updatedOrder.riderId) {
          this.trackingGateway.server.emit(`order_cancelled_${updatedOrder.riderId}`, {
            orderId: updatedOrder.id,
            message: 'The customer has cancelled this order.'
          });
        }
      }

      // 4. Notify Rider if status is 'Ready' (Vendor preparation flow)
      if (status === 'Ready' && updatedOrder.riderId) {
        this.trackingGateway.server.emit(`order_ready_${updatedOrder.riderId}`, {
          orderId: updatedOrder.id,
          message: 'Order is ready for pickup!',
          vendor: (updatedOrder as any).restaurantName
        });
      }
      
      return updatedOrder;
    } catch (error) {
      throw new BadRequestException(`Failed to update order status: ${error.message}`);
    }
  }
  async rateOrder(orderId: string, data: { rating: number; feedback?: string }) {
    if (data.rating < 1 || data.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { rider: true, customer: true },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    if (order.status !== 'Completed') {
      throw new BadRequestException('You can only rate completed orders');
    }

    // 1. Update order
    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        rating: data.rating,
        feedback: data.feedback,
      },
    });

    // 2. Recalculate Rider Rating
    if (order.riderId) {
      const allRatedOrders = await this.prisma.order.findMany({
        where: { riderId: order.riderId, NOT: { rating: null } },
        select: { rating: true },
      });

      const totalRating = allRatedOrders.reduce((acc, curr) => acc + (curr.rating || 0), 0);
      const averageRating = totalRating / allRatedOrders.length;

      await this.prisma.rider.update({
        where: { id: order.riderId },
        data: { rating: averageRating },
      });
    }

    // 3. Create Admin Notification
    const notification = await this.prisma.notification.create({
      data: {
        title: 'New Ride Rating',
        message: `${order.customer.name} rated ${order.rider?.name || 'a rider'} ${data.rating} stars. Feedback: ${data.feedback || 'No feedback provided.'}`,
        type: 'RATING_ALERT',
      },
    });

    // 4. Emit to Admin
    this.trackingGateway.server.emit('admin_new_notification', notification);
    this.trackingGateway.server.emit('admin_rating_update', {
      orderId,
      rating: data.rating,
      feedback: data.feedback,
      riderId: order.riderId,
    });

    return updatedOrder;
  }

  async findById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        rider: true,
      },
    });

    if (!order) {
      throw new Error(`Order with ID ${id} not found`);
    }

    return {
      id: order.id,
      orderNumber: order.id.slice(0, 8).toUpperCase(),
      customer: order.customer.name,
      rider: order.rider ? order.rider.name : 'Unassigned',
      status: order.status,
      type: (order as any).type,
      restaurant: (order as any).restaurantName || 'N/A',
      amount: order.amount,
      pickup: order.pickupLocation,
      dropoff: order.dropoffLocation,
      date: order.createdAt.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    };
  }

  async delete(id: string) {
    try {
      return await this.prisma.order.delete({
        where: { id },
      });
    } catch (error) {
      throw new BadRequestException(`Failed to delete order: ${error.message}`);
    }
  }

  async confirmCashPayment(orderId: string, riderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, rider: true }
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    if (order.riderId !== riderId) {
      throw new BadRequestException('You are not authorized to confirm payment for this order');
    }

    if (order.status !== 'CustomerConfirmed') {
      throw new BadRequestException('Customer has not confirmed payment for this order yet.');
    }

    const adminCommission = order.commission || (order.amount * 0.15);
    const now = new Date();

    const rider = await this.prisma.rider.findUnique({ where: { id: riderId } });
    let newStreak = 1;
    if (rider?.lastTripAt) {
      const hoursSinceLastTrip = (now.getTime() - rider.lastTripAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastTrip < 24) {
        newStreak = (rider.streak || 0) + 1;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Update Rider (wallet goes down by commission, earnings goes up by 85%)
      await tx.rider.update({
        where: { id: riderId },
        data: {
          walletBalance: { decrement: adminCommission },
          earnings: { increment: order.amount - adminCommission },
          rides: { increment: 1 },
          streak: newStreak,
          lastTripAt: now
        }
      });

      // 2. Increment Admin Wallet
      await tx.adminWallet.upsert({
        where: { id: 'kogi-admin-wallet' },
        create: {
          id: 'kogi-admin-wallet',
          balance: adminCommission,
          totalEarned: adminCommission
        },
        update: {
          balance: { increment: adminCommission },
          totalEarned: { increment: adminCommission }
        }
      });

      // 3. Create Admin Commission Transaction Log
      await tx.transaction.create({
        data: {
          reference: `COMM-${orderId.substring(0,8)}-${Date.now()}`,
          type: 'Admin Commission',
          amount: adminCommission,
          status: 'Completed',
          method: 'Platform',
          description: `Cash Commission from Order ${orderId.substring(0,8)}`,
          adminWalletId: 'kogi-admin-wallet',
          orderId: orderId
        }
      });

      // 4. Create Rider Commission Debit Transaction Log
      await tx.transaction.create({
        data: {
          reference: `DEB-${orderId.substring(0,8)}-${Date.now()}`,
          type: 'Debit',
          amount: adminCommission,
          status: 'Completed',
          method: 'Platform',
          description: `Platform Fee (Cash Trip ${orderId.substring(0,8)})`,
          riderId: riderId,
          orderId: orderId
        }
      });

      // 5. Update the order status to Completed
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: 'Completed',
          commission: adminCommission
        },
        include: { customer: true, rider: true }
      });
    });

    // Emit socket event to notify both apps that the trip is fully completed!
    this.trackingGateway.server.emit('order_status_update', {
      orderId: order.id,
      status: 'Completed',
      order: result
    });

    // Create Admin Notification for Commission
    const notification = await this.notificationsService.create({
      title: 'Platform Commission Earned',
      message: `You earned ₦${adminCommission.toLocaleString()} from Order #${orderId.substring(0,8)} (Rider: ${order.rider?.name || 'Unknown'})`,
      type: 'PAYMENT_ALERT',
    });
    this.trackingGateway.server.emit('admin_new_notification', notification);

    return result;
  }

  /**
   * Auto-cancel rides where the driver has been waiting at pickup for 5+ minutes
   * (customer no-show). No penalty for the driver.
   */
  @Cron('*/30 * * * * *') // Every 30 seconds
  async handleNoShowAutoCancel() {
    const cutoff = new Date(Date.now() - OrdersService.NO_SHOW_TIMEOUT_MINUTES * 60 * 1000);

    const staleOrders = await this.prisma.order.findMany({
      where: {
        status: { in: ['Arrived', 'DriverArrived'] },
        arrivedAt: { lte: cutoff },
      },
      include: { customer: true, rider: true },
    });

    for (const order of staleOrders) {
      try {
        this.logger.warn(
          `⏰ [NO-SHOW] Auto-cancelling order ${order.id} — driver ${order.rider?.name} waited ${OrdersService.NO_SHOW_TIMEOUT_MINUTES}+ minutes`,
        );

        // 1. Update order to Cancelled with NO penalty
        const updatedOrder = await this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'Cancelled',
            cancelledBy: 'system',
            cancelledAt: new Date(),
            cancellationReason: 'Customer no-show after 5 minutes',
            cancellationPenalty: 0,  // NO fine for the driver
            refundAmount: 0,
          },
        });

        // 2. Clean up ActiveRideRequest
        await this.prisma.activeRideRequest.updateMany({
          where: { orderId: order.id },
          data: { status: 'CANCELLED' },
        });

        // 3. Notify Driver via WebSocket — ride cancelled, no penalty
        if (order.riderId) {
          this.trackingGateway.server.emit(`order_cancelled_${order.riderId}`, {
            orderId: order.id,
            message: 'Ride auto-cancelled: Customer did not show up within 5 minutes. No penalty applied.',
            reason: 'no_show',
          });
        }

        // 4. Notify Customer via WebSocket
        this.trackingGateway.server.emit(`customer_notification_${order.customerId}`, {
          title: 'Ride Cancelled',
          message: 'Your ride was cancelled because you did not show up within 5 minutes of the driver arriving.',
          type: 'ORDER_CANCELLED',
        });

        // 5. Emit general order status update (for both apps)
        this.trackingGateway.notifyOrderStatus(order.id, 'Cancelled', {
          reason: 'no_show',
          cancelledBy: 'system',
          message: 'Customer no-show after 5 minutes',
        });

        // 6. Create admin notification
        const notification = await this.notificationsService.create({
          title: 'Auto-Cancelled: Customer No-Show',
          message: `Order #${order.id.substring(0, 8)} auto-cancelled — driver ${order.rider?.name || 'Unknown'} waited 5 min at pickup. No penalty applied.`,
          type: 'ORDER_CANCELLED',
        });
        this.trackingGateway.server.emit('admin_new_notification', notification);
        this.trackingGateway.server.emit('admin_order_update', updatedOrder);

        this.logger.log(`✅ [NO-SHOW] Order ${order.id} auto-cancelled successfully. Driver penalty: ₦0`);
      } catch (error) {
        this.logger.error(`❌ [NO-SHOW] Failed to auto-cancel order ${order.id}: ${error.message}`);
      }
    }
  }
}
