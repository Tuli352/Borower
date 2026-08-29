import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InterStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllRoutes(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    return this.prisma.interStateRoute.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async createRoute(data: {
    fromCity: string;
    toCity: string;
    distance: string;
    duration: string;
    price: number;
    stops?: string;
  }) {
    return this.prisma.interStateRoute.create({ data });
  }

  async getRoute(id: string) {
    const route = await this.prisma.interStateRoute.findUnique({ where: { id } });
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }

  async updateRoute(id: string, data: any) {
    await this.getRoute(id);
    return this.prisma.interStateRoute.update({ where: { id }, data });
  }

  async deleteRoute(id: string) {
    await this.getRoute(id);
    return this.prisma.interStateRoute.delete({ where: { id } });
  }

  async getStatistics() {
    const total = await this.prisma.interStateRoute.count();
    const active = await this.prisma.interStateRoute.count({ where: { status: 'active' } });
    return { total, active };
  }
}
