import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async searchAll(query: string) {
    if (!query || query.length < 2) {
      return { riders: [], customers: [], vendors: [], orders: [] };
    }

    const searchCondition = { contains: query };

    const [riders, customers, vendors] = await Promise.all([
      this.prisma.rider.findMany({
        where: { OR: [{ name: searchCondition }, { email: searchCondition }, { vehicle: searchCondition }] },
        take: 3
      }),
      this.prisma.customer.findMany({
        where: { OR: [{ name: searchCondition }, { email: searchCondition }] },
        take: 3
      }),
      this.prisma.vendor.findMany({
        where: { OR: [{ companyName: searchCondition }, { contactPerson: searchCondition }, { email: searchCondition }] },
        take: 3
      })
    ]);

    return { riders, customers, vendors, orders: [] };
  }
}
