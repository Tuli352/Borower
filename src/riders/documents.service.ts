import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private trackingGateway: TrackingGateway
  ) {}

  async uploadDocument(riderId: string, data: { type: string; url: string; expiryDate?: Date }) {
    return this.prisma.riderDocument.create({
      data: {
        riderId,
        ...data,
        status: 'Pending',
      },
    });
  }

  async getRiderDocuments(riderId: string) {
    return this.prisma.riderDocument.findMany({
      where: { riderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateDocumentStatus(id: string, status: string, notes?: string) {
    const doc = await this.prisma.riderDocument.update({
      where: { id },
      data: { status, notes },
    });

    if (status === 'Rejected') {
      const notification = await this.notificationsService.create({
        title: 'Document Rejected',
        message: `Your document (${doc.type}) was rejected. Reason: ${notes || 'Please re-upload a clearer copy.'}`,
        type: 'DOCUMENT_REJECTED'
      });
      this.trackingGateway.server.emit(`rider_notification_${doc.riderId}`, notification);
    } else if (status === 'Approved') {
      const allDocs = await this.prisma.riderDocument.findMany({ where: { riderId: doc.riderId } });
      const allApproved = allDocs.length > 0 && allDocs.every(d => d.status === 'Approved');
      
      if (allApproved) {
        await this.prisma.rider.update({
          where: { id: doc.riderId },
          data: { status: 'Online' }
        });
        
        const notification = await this.notificationsService.create({
          title: 'Account Activated',
          message: 'All your documents have been approved. You are now online and can receive ride requests.',
          type: 'ACCOUNT_ACTIVATED'
        });
        this.trackingGateway.server.emit(`rider_notification_${doc.riderId}`, notification);
      }
    }

    return doc;
  }

  async deleteDocument(id: string) {
    return this.prisma.riderDocument.delete({ where: { id } });
  }
}
