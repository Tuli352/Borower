import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
  ) {}

  async saveMessage(data: { orderId: string; senderId: string; senderRole: string; text: string }) {
    // 1. Save to database
    const message = await this.prisma.chatMessage.create({
      data: {
        orderId: data.orderId,
        senderId: data.senderId,
        senderRole: data.senderRole,
        text: data.text,
      },
    });

    // 2. Broadcast via WebSocket to the relevant party
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      select: { customerId: true, riderId: true },
    });

    if (order) {
      // Send to the room using the same format expected by Customer App's WebSocket listener
      this.trackingGateway.server.to(`chat_${data.orderId}`).emit('new_order_message', {
        id: message.id,
        orderId: data.orderId,
        message: data.text,
        senderId: data.senderId,
        isDriver: data.senderRole !== 'CUSTOMER',
        createdAt: message.createdAt.toISOString(),
      });

      // Keep legacy specific emit
      const recipientId = data.senderRole === 'CUSTOMER' ? order.riderId : order.customerId;
      if (recipientId) {
        this.trackingGateway.server.emit(`new_chat_message_${recipientId}`, message);
      }
    }

    return message;
  }

  async getMessagesForOrder(orderId: string) {
    return this.prisma.chatMessage.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
