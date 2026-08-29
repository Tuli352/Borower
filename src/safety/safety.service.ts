import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
    private smsService: SmsService,
  ) {}

  async addEmergencyContact(customerId: string, data: { name: string; phone: string }) {
    return this.prisma.emergencyContact.create({
      data: {
        customerId,
        name: data.name,
        phone: data.phone,
      },
    });
  }

  async getEmergencyContacts(customerId: string) {
    return this.prisma.emergencyContact.findMany({
      where: { customerId },
    });
  }

  async removeEmergencyContact(customerId: string, id: string) {
    return this.prisma.emergencyContact.delete({
      where: { id, customerId },
    });
  }

  async triggerSos(orderId: string, userId: string, role: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, rider: true },
    });

    if (!order) throw new Error('Order not found');

    const alertPayload = {
      orderId,
      userId,
      role,
      location: {
        lat: role === 'customer' ? order.pickupLat : order.rider?.latitude,
        lng: role === 'customer' ? order.pickupLng : order.rider?.longitude,
      },
      timestamp: new Date(),
    };

    // 1. Broadcast to Admin Dashboard instantly via WebSockets
    this.trackingGateway.server.emit('admin_sos_alert', alertPayload);

    // 2. Log the SOS event in notifications
    await this.prisma.notification.create({
      data: {
        title: `EMERGENCY: SOS Triggered`,
        message: `SOS triggered by ${role} on Order ${orderId.slice(0, 8)}`,
        type: 'SOS',
      },
    });

    // 3. Send SMS to Admin emergency line
    const adminEmergencyPhone = process.env.EMERGENCY_CONTACT_PHONE;
    if (adminEmergencyPhone) {
        await this.smsService.sendSms(adminEmergencyPhone, `KOGI RIDE SOS: ${role} triggered alert for Order ${orderId.slice(0, 8)}. Check admin dashboard.`);
    }

    // 4. Send SMS to user's saved emergency contacts if customer triggered it
    if (role === 'customer') {
      const contacts = await this.prisma.emergencyContact.findMany({ where: { customerId: userId } });
      for (const contact of contacts) {
        await this.smsService.sendSms(contact.phone, `KOGI RIDE EMERGENCY: ${order.customer.name} triggered an SOS alert during a trip. Live tracking active.`);
      }
    }

    this.logger.warn(`SOS triggered for Order ${orderId} by ${role} ${userId}`);
    
    return { success: true, message: 'SOS alert dispatched to security team' };
  }

  async getIncidents() {
    return this.prisma.notification.findMany({
      where: { type: 'SOS' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
