import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import axios from 'axios';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trackingGateway: TrackingGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Create a parcel delivery order.
   * deliveryDetails JSON shape: {
   *   senderName, senderPhone, recipientName, recipientPhone,
   *   packageDescription, packageWeight, isFragile
   * }
   */
  async createParcelDelivery(
    customerId: string,
    data: {
      pickupLocation: string;
      dropoffLocation: string;
      pickupLat?: number;
      pickupLng?: number;
      dropoffLat?: number;
      dropoffLng?: number;
      amount: number;
      deliveryDetails: {
        senderName: string;
        senderPhone: string;
        recipientName: string;
        recipientPhone: string;
        packageDescription?: string;
        packageWeight?: number;
        isFragile?: boolean;
      };
      stops?: { lat: number; lng: number; address?: string }[];
    },
  ) {
    // Geocode if needed
    let { pickupLat, pickupLng, dropoffLat, dropoffLng } = data;
    if (!pickupLat || !pickupLng) {
      const coords = await this.geocode(data.pickupLocation);
      pickupLat = coords.lat;
      pickupLng = coords.lng;
    }
    if (!dropoffLat || !dropoffLng) {
      const coords = await this.geocode(data.dropoffLocation);
      dropoffLat = coords.lat;
      dropoffLng = coords.lng;
    }

    const deliveryCode = Math.floor(1000 + Math.random() * 9000).toString();

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
        status: 'Pending',
        type: 'Parcel',
        deliveryCode,
        deliveryDetails: JSON.stringify(data.deliveryDetails),
        stops: data.stops ? JSON.stringify(data.stops) : null,
        commission: data.amount * 0.15,
      },
      include: { customer: true },
    });

    this.trackingGateway.server.emit('admin_new_order', order);
    this.logger.log(`📦 Parcel delivery order ${order.id} created for customer ${customerId}`);

    return order;
  }

  /**
   * Verify delivery code and mark the order as delivered.
   */
  async verifyAndCompleteDelivery(orderId: string, riderId: string, verificationCode: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, rider: true },
    });

    if (!order) throw new BadRequestException('Order not found');
    if (order.riderId !== riderId) throw new BadRequestException('Unauthorized');
    if (order.type !== 'Parcel' && order.type !== 'Food')
      throw new BadRequestException('This endpoint is for delivery orders only');

    if (!order.deliveryCode) throw new BadRequestException('No delivery code on this order');
    if (order.deliveryCode !== verificationCode) {
      throw new BadRequestException('Invalid delivery code. Ask the recipient for their 4-digit code.');
    }

    const adminCommission = order.commission || order.amount * 0.15;
    const riderEarnings = order.amount - adminCommission;

    const result = await this.prisma.$transaction(async (tx) => {
      // Credit rider
      await tx.rider.update({
        where: { id: riderId },
        data: {
          walletBalance: { increment: riderEarnings },
          earnings: { increment: riderEarnings },
          rides: { increment: 1 },
        },
      });

      // Credit admin
      await tx.adminWallet.upsert({
        where: { id: 'kogi-admin-wallet' },
        create: { id: 'kogi-admin-wallet', balance: adminCommission, totalEarned: adminCommission },
        update: { balance: { increment: adminCommission }, totalEarned: { increment: adminCommission } },
      });

      // Log transactions
      await tx.transaction.create({
        data: {
          reference: `DLVR-COMM-${orderId.substring(0, 8)}-${Date.now()}`,
          type: 'Admin Commission',
          amount: adminCommission,
          status: 'Completed',
          method: 'Platform',
          description: `Delivery commission from Order ${orderId.substring(0, 8)}`,
          adminWalletId: 'kogi-admin-wallet',
          orderId,
        },
      });

      await tx.transaction.create({
        data: {
          reference: `DLVR-EARN-${orderId.substring(0, 8)}-${Date.now()}`,
          type: 'Earnings',
          amount: riderEarnings,
          status: 'Completed',
          method: 'Platform',
          description: `Delivery earnings from Order ${orderId.substring(0, 8)}`,
          riderId,
          orderId,
        },
      });

      return tx.order.update({
        where: { id: orderId },
        data: { status: 'Completed' },
        include: { customer: true, rider: true },
      });
    });

    // Notify
    this.trackingGateway.notifyOrderStatus(orderId, 'Completed', { deliveryVerified: true });

    const notification = await this.notificationsService.create({
      title: 'Delivery Completed',
      message: `Parcel Order #${orderId.substring(0, 8)} was delivered and verified.`,
      type: 'ORDER_COMPLETED',
    });
    this.trackingGateway.server.emit('admin_new_notification', notification);

    return result;
  }

  /**
   * Get delivery tracking details including recipient info.
   */
  async getDeliveryDetails(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, rider: true },
    });
    if (!order) throw new BadRequestException('Order not found');

    return {
      id: order.id,
      status: order.status,
      type: order.type,
      pickup: order.pickupLocation,
      dropoff: order.dropoffLocation,
      amount: order.amount,
      deliveryDetails: order.deliveryDetails ? JSON.parse(order.deliveryDetails) : null,
      rider: order.rider
        ? { id: order.rider.id, name: order.rider.name, phone: order.rider.phone, vehicle: order.rider.vehicle }
        : null,
      customer: { name: order.customer.name, phone: order.customer.phone },
    };
  }

  private async geocode(address: string): Promise<{ lat: number; lng: number }> {
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { format: 'json', q: address, limit: 1 },
        headers: { 'User-Agent': 'KogiRiderBackend/1.0' },
      });
      if (response.data?.length > 0) {
        return { lat: parseFloat(response.data[0].lat), lng: parseFloat(response.data[0].lon) };
      }
    } catch (e) {
      this.logger.warn(`Geocoding failed for "${address}": ${e.message}`);
    }
    return { lat: 7.8023, lng: 6.7333 }; // Lokoja default
  }
}
