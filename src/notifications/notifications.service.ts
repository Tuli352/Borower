import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  markAllAsRead() {
    return this.prisma.notification.updateMany({
      where: { read: false },
      data: { read: true },
    });
  }

  delete(id: string) {
    return this.prisma.notification.delete({
      where: { id },
    });
  }

  async create(data: { title: string; message: string; type: string }) {
    return this.prisma.notification.create({
      data: {
        ...data,
        read: false,
      },
    });
  }
}
