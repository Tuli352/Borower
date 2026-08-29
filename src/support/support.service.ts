import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
    private mailService: MailService,
    private notificationsService: NotificationsService,
    private paymentsService: PaymentsService,
  ) {}

  findAll() {
    return this.prisma.ticket.findMany({ 
      include: { messages: true },
      orderBy: { createdAt: 'desc' } 
    });
  }

  findTicketsByUser(userId: string) {
    return this.prisma.ticket.findMany({
      where: { userId },
      include: { messages: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  findOne(id: string) {
    return this.prisma.ticket.findUnique({ 
      where: { id },
      include: { messages: true }
    });
  }

  async createTicket(data: any) {
    const mappedData = {
      subject: data.subject || 'No Subject',
      description: data.body || data.description || data.message || 'No Description',
      type: data.category || data.type || 'General',
      userId: data.userId,
      userRole: data.userRole || 'CUSTOMER',
      userEmail: data.userEmail,
      userPhone: data.userPhone,
      user: data.user || data.name || 'Unknown User',
      priority: data.priority || 'Medium',
      orderReference: data.orderReference || data.orderId || null,
      status: 'Open',
      attachments: data.attachments ? JSON.stringify(data.attachments) : null,
    };

    const ticket = await this.prisma.ticket.create({ data: mappedData });

    // Create persistent Notification for Admin
    const notification = await this.notificationsService.create({
      title: `New Support Ticket: ${ticket.subject}`,
      message: `From ${ticket.user} (${ticket.userRole}): ${ticket.description.substring(0, 100)}${ticket.description.length > 100 ? '...' : ''}`,
      type: 'SUPPORT'
    });

    // Emit real-time notification to Admin Dashboard
    this.trackingGateway.server.emit('admin_new_notification', notification);

    return ticket;
  }

  updateTicket(id: string, data: any) {
    return this.prisma.ticket.update({
      where: { id },
      data,
    });
  }

  async addMessage(ticketId: string, sender: string, text: string, action?: string) {
    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        sender,
        text,
        action,
      },
      include: { ticket: true }
    });

    if (action && message.ticket.orderReference) {
      try {
        const order = await this.prisma.order.findUnique({ 
          where: { id: message.ticket.orderReference } 
        });
        
        if (order) {
          if (action === 'refund') {
            await this.paymentsService.processRefund(order.id, order.amount, `Refund issued for ticket ${ticketId}`);
          } else if (action === 'credit') {
            await this.paymentsService.fundUserWallet({ 
              userId: order.customerId, 
              userType: 'Customer', 
              amount: order.amount, 
              description: `Credit issued for ticket ${ticketId}` 
            });
          } else if (action === 'penalize' && order.riderId) {
            await this.paymentsService.penalizeUser(
              order.riderId, 
              'Rider', 
              order.amount, 
              `Penalty applied for ticket ${ticketId}`
            );
          }
        }
      } catch (error: any) {
        this.logger.error(`Failed to process action ${action} for ticket ${ticketId}: ${error.message}`);
      }
    }

    // If Admin is replying, notify the user via email
    if (sender === 'Admin' && message.ticket.userEmail) {
      try {
        await this.mailService.sendGenericEmail(
          message.ticket.userEmail,
          `Update on your Support Ticket: ${message.ticket.subject}`,
          'Support Ticket Update',
          `Hello ${message.ticket.user},\n\nOur support team has replied to your ticket:\n\n"${text}"\n\nPlease check your app for more details or reply to this thread.\n\nRegards,\nKogi Support Team`
        );
      } catch (error) {
        this.logger.error(`Failed to send support reply email: ${error.message}`);
      }
    }

    return message;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleAutoClosure() {
    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

    const staleTickets = await this.prisma.ticket.findMany({
      where: {
        status: { not: 'Resolved' },
        updatedAt: { lte: fortyEightHoursAgo },
      },
    });

    for (const ticket of staleTickets) {
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'Resolved' },
      });
      
      this.logger.log(`Auto-closed ticket ${ticket.id} due to 48h inactivity.`);
    }
  }
}

