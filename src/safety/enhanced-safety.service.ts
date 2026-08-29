import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { SmsService } from '../sms/sms.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class EnhancedSafetyService {
  private readonly logger = new Logger(EnhancedSafetyService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private trackingGateway: TrackingGateway,
    private smsService: SmsService,
    private mailService: MailService,
  ) {}

  // Share trip with emergency contacts
  async shareTripWithContacts(data: {
    orderId: string;
    userId: string;
    userType: 'customer' | 'rider';
    contactIds: string[];
    message?: string;
    duration?: number; // in hours, default 24
  }) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: data.orderId },
        include: { customer: true, rider: true }
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      // Verify user is part of the order
      const isParticipant = 
        (data.userType === 'customer' && order.customerId === data.userId) ||
        (data.userType === 'rider' && order.riderId === data.userId);

      if (!isParticipant) {
        throw new BadRequestException('You can only share trips you are participating in');
      }

      // Get emergency contacts
      const contacts = await this.prisma.emergencyContact.findMany({
        where: {
          customerId: data.userId,
          id: { in: data.contactIds }
        }
      });

      if (contacts.length === 0) {
        throw new BadRequestException('No valid emergency contacts found');
      }

      // Create trip sharing record
      const expiresAt = new Date(Date.now() + (data.duration || 24) * 60 * 60 * 1000);
      
      const tripShare = await (this.prisma as any).TripShare.create({
        data: {
          orderId: data.orderId,
          userId: data.userId,
          userType: data.userType,
          contactIds: JSON.stringify(data.contactIds),
          message: data.message || 'I am sharing my trip location with you for safety.',
          expiresAt,
          isActive: true,
          createdAt: new Date()
        }
      });

      // Generate sharing link
      const sharingLink = `https://kogiride.com/trip-share/${tripShare.id}`;

      // Send notifications to contacts
      for (const contact of contacts) {
        await this.sendTripShareNotification(contact, order, sharingLink, data.message);
      }

      // Send confirmation to user
      const userNotification = await this.notificationsService.create({
        title: 'Trip Shared Successfully',
        message: `Your trip has been shared with ${contacts.length} emergency contacts. Sharing link: ${sharingLink}`,
        type: 'TRIP_SHARE_CONFIRMATION',
      });

      const userSocketEvent = data.userType === 'customer' ? 
        `customer_notification_${data.userId}` : 
        `rider_notification_${data.userId}`;

      this.trackingGateway.server.emit(userSocketEvent, userNotification);

      this.logger.log(`Trip ${data.orderId} shared with ${contacts.length} contacts by ${data.userType}`);

      return {
        success: true,
        tripShare,
        sharingLink,
        contactsNotified: contacts.length,
        expiresAt
      };
    } catch (error) {
      this.logger.error(`Failed to share trip: ${error.message}`);
      throw error;
    }
  }

  // Get active trip shares
  async getActiveTripShares(userId: string, userType: 'customer' | 'rider') {
    return await (this.prisma as any).TripShare.findMany({
      where: {
        userId,
        userType,
        isActive: true,
        expiresAt: { gt: new Date() }
      },
      include: {
        order: {
          select: { id: true, status: true, pickupLocation: true, dropoffLocation: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  // Revoke trip sharing
  async revokeTripSharing(shareId: string, userId: string) {
    const tripShare = await (this.prisma as any).TripShare.findUnique({
      where: { id: shareId }
    });

    if (!tripShare) {
      throw new NotFoundException('Trip share not found');
    }

    if (tripShare.userId !== userId) {
      throw new BadRequestException('You can only revoke your own trip shares');
    }

    await (this.prisma as any).TripShare.update({
      where: { id: shareId },
      data: { isActive: false, revokedAt: new Date() }
    });

    return { success: true, message: 'Trip sharing revoked successfully' };
  }

  // Enhanced SOS with location and media
  async triggerEnhancedSOS(data: {
    orderId: string;
    userId: string;
    userType: 'customer' | 'rider';
    emergencyType: 'medical' | 'accident' | 'harassment' | 'theft' | 'other';
    location: {
      lat: number;
      lng: number;
      address?: string;
    };
    description?: string;
    media?: {
      images?: string[];
      videos?: string[];
      audio?: string[];
    };
    immediateDanger?: boolean;
  }) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: data.orderId },
        include: { customer: true, rider: true }
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      // Create SOS incident record
      const sosIncident = await (this.prisma as any).SOSIncident.create({
        data: {
          orderId: data.orderId,
          userId: data.userId,
          userType: data.userType,
          emergencyType: data.emergencyType,
          location: JSON.stringify(data.location),
          description: data.description,
          media: data.media ? JSON.stringify(data.media) : null,
          immediateDanger: data.immediateDanger || false,
          status: 'active',
          createdAt: new Date()
        }
      });

      // Get user's emergency contacts
      const emergencyContacts = await this.prisma.emergencyContact.findMany({
        where: { customerId: data.userId }
      });

      // Get user info for notifications
      const user = data.userType === 'customer' ? order.customer : order.rider;

      // Send alerts to emergency contacts
      const alertedContacts = [];
      for (const contact of emergencyContacts) {
        const alerted = await this.sendSOSAlert(contact, user, data, sosIncident.id);
        if (alerted) alertedContacts.push(contact);
      }

      // Send to admin and emergency services if immediate danger
      if (data.immediateDanger) {
        await this.sendToEmergencyServices(user, data, sosIncident.id);
        await this.sendToAdminTeam(user, data, sosIncident.id, 'high_priority');
      } else {
        await this.sendToAdminTeam(user, data, sosIncident.id, 'standard');
      }

      // Broadcast SOS to nearby riders (if customer) or admin team (if rider)
      await this.broadcastSOS(data.orderId, data.userType, data.location, sosIncident.id);

      // Create user notification
      const userNotification = await this.notificationsService.create({
        title: 'SOS Alert Triggered',
        message: `Your SOS alert has been sent to ${alertedContacts.length} emergency contacts and our support team. Help is on the way.`,
        type: 'SOS_TRIGGERED',
      });

      const userSocketEvent = data.userType === 'customer' ? 
        `customer_notification_${data.userId}` : 
        `rider_notification_${data.userId}`;

      this.trackingGateway.server.emit(userSocketEvent, userNotification);

      this.logger.log(`SOS incident ${sosIncident.id} triggered by ${data.userType} - ${data.emergencyType}`);

      return {
        success: true,
        sosIncident,
        contactsAlerted: alertedContacts.length,
        incidentId: sosIncident.id
      };
    } catch (error) {
      this.logger.error(`Failed to trigger SOS: ${error.message}`);
      throw error;
    }
  }

  // Send trip share notification to contact
  private async sendTripShareNotification(contact: any, order: any, sharingLink: string, message?: string) {
    try {
      const shareMessage = `
${message}

Trip Details:
- From: ${order.pickupLocation}
- To: ${order.dropoffLocation}
- Status: ${order.status}

Track my location in real-time: ${sharingLink}

This link will expire in 24 hours for your privacy.

- Kogi Ride Safety Team
      `.trim();

      // Send SMS
      if (contact.phone) {
        await this.smsService.sendSms(contact.phone, shareMessage);
      }

      // Send email if available
      if (contact.email) {
        await (this.mailService as any).sendMail({
          to: contact.email,
          subject: 'Trip Location Shared - Kogi Ride',
          text: shareMessage,
          html: `
            <h2>Trip Location Shared</h2>
            <p>${message}</p>
            <div style="background: #f5f5f5; padding: 15px; margin: 10px 0;">
              <h3>Trip Details:</h3>
              <p><strong>From:</strong> ${order.pickupLocation}</p>
              <p><strong>To:</strong> ${order.dropoffLocation}</p>
              <p><strong>Status:</strong> ${order.status}</p>
            </div>
            <p>
              <a href="${sharingLink}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                Track Location in Real-Time
              </a>
            </p>
            <p><small>This link will expire in 24 hours for privacy protection.</small></p>
            <hr>
            <p><em>- Kogi Ride Safety Team</em></p>
          `
        });
      }
    } catch (error) {
      this.logger.error(`Failed to send trip share notification to ${contact.name}: ${error.message}`);
    }
  }

  // Send SOS alert to emergency contact
  private async sendSOSAlert(contact: any, user: any, sosData: any, incidentId: string): Promise<boolean> {
    try {
      const alertMessage = `
🚨 EMERGENCY ALERT - KOGI RIDE 🚨

${user.name} has triggered an SOS alert!

Emergency Type: ${sosData.emergencyType.toUpperCase()}
Location: ${sosData.location.address || `${sosData.location.lat}, ${sosData.location.lng}`}
Description: ${sosData.description || 'No description provided'}

Time: ${new Date().toLocaleString()}
Incident ID: ${incidentId}

Please check on them immediately and contact emergency services if needed.

Track their location: https://kogiride.com/sos-track/${incidentId}

- Kogi Ride Safety Team
      `.trim();

      // Send SMS
      if (contact.phone) {
        await this.smsService.sendSms(contact.phone, alertMessage);
      }

      // Send email
      if (contact.email) {
        await (this.mailService as any).sendMail({
          to: contact.email,
          subject: `🚨 EMERGENCY ALERT - ${user.name}`,
          text: alertMessage,
          html: `
            <div style="background: #ffebee; border: 2px solid #f44336; padding: 20px; margin: 10px 0;">
              <h2 style="color: #d32f2f;">🚨 EMERGENCY ALERT - KOGI RIDE 🚨</h2>
              <p><strong>${user.name}</strong> has triggered an SOS alert!</p>
              <div style="background: white; padding: 15px; margin: 10px 0;">
                <p><strong>Emergency Type:</strong> ${sosData.emergencyType.toUpperCase()}</p>
                <p><strong>Location:</strong> ${sosData.location.address || `${sosData.location.lat}, ${sosData.location.lng}`}</p>
                <p><strong>Description:</strong> ${sosData.description || 'No description provided'}</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Incident ID:</strong> ${incidentId}</p>
              </div>
              <p style="color: #d32f2f; font-weight: bold;">
                Please check on them immediately and contact emergency services if needed.
              </p>
              <p>
                <a href="https://kogiride.com/sos-track/${incidentId}" 
                   style="background: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                  Track Their Location
                </a>
              </p>
            </div>
            <hr>
            <p><em>- Kogi Ride Safety Team</em></p>
          `
        });
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to send SOS alert to ${contact.name}: ${error.message}`);
      return false;
    }
  }

  // Send to emergency services
  private async sendToEmergencyServices(user: any, sosData: any, incidentId: string) {
    try {
      const emergencyMessage = `
EMERGENCY SERVICES NOTIFICATION - KOGI RIDE

INCIDENT REPORT:
- User: ${user.name} (${user.phone})
- Emergency: ${sosData.emergencyType}
- Location: ${sosData.location.address || `${sosData.location.lat}, ${sosData.location.lng}`}
- Description: ${sosData.description}
- Immediate Danger: YES
- Time: ${new Date().toLocaleString()}
- Incident ID: ${incidentId}

IMMEDIATE ASSISTANCE REQUIRED!

Contact: ${user.phone}
Track: https://kogiride.com/sos-track/${incidentId}
      `.trim();

      // This would integrate with local emergency services
      // For now, log and send to admin
      this.logger.error(`EMERGENCY SERVICES NOTIFICATION: ${emergencyMessage}`);
      
      // Send high-priority alert to admin team
      await this.notificationsService.create({
        title: '🚨 IMMEDIATE DANGER - Emergency Services Notified',
        message: emergencyMessage,
        type: 'IMMEDIATE_EMERGENCY',
      });

      this.trackingGateway.server.emit('admin_emergency_alert', {
        type: 'immediate_danger',
        user,
        sosData,
        incidentId,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error(`Failed to notify emergency services: ${error.message}`);
    }
  }

  // Send to admin team
  private async sendToAdminTeam(user: any, sosData: any, incidentId: string, priority: 'high_priority' | 'standard') {
    try {
      const adminMessage = `
SOS ALERT - KOGI RIDE [${priority.toUpperCase()}]

User: ${user.name} (${user.phone})
Emergency Type: ${sosData.emergencyType}
Location: ${sosData.location.address || `${sosData.location.lat}, ${sosData.location.lng}`}
Description: ${sosData.description}
Immediate Danger: ${sosData.immediateDanger ? 'YES' : 'NO'}
Time: ${new Date().toLocaleString()}
Incident ID: ${incidentId}

Track: https://kogiride.com/sos-track/${incidentId}
      `.trim();

      const notification = await this.notificationsService.create({
        title: priority === 'high_priority' ? '🚨 High Priority SOS Alert' : 'SOS Alert',
        message: adminMessage,
        type: priority === 'high_priority' ? 'HIGH_PRIORITY_SOS' : 'SOS_ALERT',
      });

      this.trackingGateway.server.emit('admin_sos_alert', {
        type: priority,
        user,
        sosData,
        incidentId,
        notification,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error(`Failed to notify admin team: ${error.message}`);
    }
  }

  // Broadcast SOS to nearby users
  private async broadcastSOS(orderId: string, userType: string, location: any, incidentId: string) {
    try {
      // Find nearby riders (if customer triggered SOS)
      if (userType === 'customer') {
        const nearbyRiders = await this.prisma.rider.findMany({
          where: {
            status: 'Active',
            latitude: { not: null },
            longitude: { not: null }
          }
        });

        // Filter riders within 2km radius
        const nearbyRidersWithinRadius = nearbyRiders.filter(rider => {
          const distance = this.calculateDistance(
            location.lat, location.lng,
            rider.latitude!, rider.longitude!
          );
          return distance <= 2; // 2km radius
        });

        // Send SOS to nearby riders
        this.trackingGateway.server.emit('nearby_sos_alert', {
          orderId,
          location,
          incidentId,
          userType: 'customer',
          timestamp: new Date(),
          message: 'A nearby customer has triggered an SOS alert. Please check if you can assist.'
        });

        this.logger.log(`SOS broadcasted to ${nearbyRidersWithinRadius.length} nearby riders`);
      }
    } catch (error) {
      this.logger.error(`Failed to broadcast SOS: ${error.message}`);
    }
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

  // Get SOS incident details
  async getSOSIncident(incidentId: string, userId: string, userRole: string) {
    const incident = await (this.prisma as any).SOSIncident.findUnique({
      where: { id: incidentId },
      include: {
        order: {
          include: { customer: true, rider: true }
        }
      }
    });

    if (!incident) {
      throw new NotFoundException('SOS incident not found');
    }

    // Check access permissions
    const hasAccess = 
      incident.userId === userId ||
      userRole.includes('admin') ||
      (incident.order && (incident.order.customerId === userId || incident.order.riderId === userId));

    if (!hasAccess) {
      throw new BadRequestException('Access denied');
    }

    return incident;
  }

  // Update SOS incident status
  async updateSOSIncident(incidentId: string, status: string, userId: string, userRole: string, notes?: string) {
    if (!userRole.includes('admin')) {
      throw new BadRequestException('Admin access required');
    }

    const incident = await (this.prisma as any).SOSIncident.update({
      where: { id: incidentId },
      data: {
        status,
        resolvedAt: status === 'resolved' ? new Date() : null,
        resolvedBy: userId,
        notes,
        updatedAt: new Date()
      }
    });

    return incident;
  }

  // Get SOS statistics
  async getSOSStatistics() {
    const total = await (this.prisma as any).SOSIncident.count();
    const active = await (this.prisma as any).SOSIncident.count({ where: { status: 'active' } });
    const resolved = await (this.prisma as any).SOSIncident.count({ where: { status: 'resolved' } });
    const immediateDanger = await (this.prisma as any).SOSIncident.count({ where: { immediateDanger: true } });

    const byType = await (this.prisma as any).SOSIncident.groupBy({
      by: ['emergencyType'],
      _count: true
    });

    const recent = await (this.prisma as any).SOSIncident.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    return {
      total,
      active,
      resolved,
      immediateDanger,
      resolutionRate: total > 0 ? ((resolved / total) * 100).toFixed(1) : '0',
      byType,
      recent
    };
  }
}
