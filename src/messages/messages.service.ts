import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BroadcastService } from '../broadcast/broadcast.service';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private prisma: PrismaService,
    private broadcastService: BroadcastService,
  ) {}

  async findAll(folder?: string) {
    const f = folder ? folder.toUpperCase() : '';
    
    if (f === 'SENT') {
      return this.prisma.message.findMany({
        where: { status: 'SENT', NOT: { recipient: 'Admin' } },
        orderBy: { createdAt: 'desc' },
      });
    } else if (f === 'DRAFT') {
      return this.prisma.message.findMany({
        where: { status: 'DRAFT' },
        orderBy: { createdAt: 'desc' },
      });
    } else if (f === 'RECEIVED') {
      return this.prisma.message.findMany({
        where: { recipient: 'Admin' },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.message.findUnique({
      where: { id },
    });
  }

  async create(data: { subject: string; content: string; recipient: string; status?: string }) {
    return this.prisma.message.create({
      data: {
        sender: 'Admin',
        subject: data.subject,
        content: data.content,
        recipient: data.recipient,
        status: data.status || 'DRAFT',
        type: 'EMAIL',
      },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.message.update({
      where: { id },
      data,
    });
  }

  async send(id: string) {
    const message = await this.prisma.message.findUnique({ where: { id } });
    if (!message) throw new Error('Message not found');

    const result = await this.broadcastService.sendBroadcast(
      message.recipient,
      message.subject,
      message.content,
      true, // skipMessageStorage
    );

    if (result.success) {
      await this.prisma.message.update({
        where: { id },
        data: { status: 'SENT' },
      });
    }

    return result;
  }

  async delete(id: string) {
    return this.prisma.message.delete({
      where: { id },
    });
  }

  async markAsRead(id: string) {
    return this.prisma.message.update({
      where: { id },
      data: { isRead: true },
    });
  }
}
