import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ParcelsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllParcels(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    return this.prisma.parcel.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async createParcel(data: {
    sender: string;
    receiver: string;
    pickup: string;
    dropoff: string;
    weight: string;
    fee: number;
    type?: string;
    estimatedDelivery?: string;
  }) {
    const trackingCode = `KGP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    return this.prisma.parcel.create({
      data: {
        sender: data.sender,
        receiver: data.receiver,
        pickup: data.pickup,
        dropoff: data.dropoff,
        weight: data.weight,
        fee: data.fee,
        type: data.type || 'small_package',
        trackingCode,
        estimatedDelivery: data.estimatedDelivery,
      },
    });
  }

  async getParcel(id: string) {
    const parcel = await this.prisma.parcel.findUnique({ where: { id } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    return parcel;
  }

  async updateParcel(id: string, data: any) {
    await this.getParcel(id);
    return this.prisma.parcel.update({ where: { id }, data });
  }

  async deleteParcel(id: string) {
    await this.getParcel(id);
    return this.prisma.parcel.delete({ where: { id } });
  }
}
