import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiMonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllAlerts(severity?: string) {
    const where: any = {};
    if (severity) where.severity = severity;
    return this.prisma.aiAlert.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async createAlert(data: {
    type: string;
    title: string;
    description: string;
    confidence: number;
    severity?: string;
    impact?: string;
  }) {
    return this.prisma.aiAlert.create({
      data: {
        type: data.type,
        title: data.title,
        description: data.description,
        confidence: data.confidence,
        impact: data.impact || 'medium',
      },
    });
  }

  async getAlert(id: string) {
    const alert = await this.prisma.aiAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('AI Alert not found');
    return alert;
  }

  async resolveAlert(id: string) {
    await this.getAlert(id);
    return this.prisma.aiAlert.update({
      where: { id },
      data: { status: 'actioned' },
    });
  }
}
