import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuService {
  constructor(private prisma: PrismaService) {}

  async createCategory(vendorId: string, data: { name: string }) {
    return this.prisma.menuCategory.create({
      data: {
        vendorId,
        name: data.name,
      },
    });
  }

  async getCategories(vendorId: string) {
    return this.prisma.menuCategory.findMany({
      where: { vendorId },
      include: { items: true },
    });
  }

  async updateCategory(id: string, data: { name?: string; isActive?: boolean }) {
    return this.prisma.menuCategory.update({
      where: { id },
      data,
    });
  }

  async deleteCategory(id: string) {
    return this.prisma.menuCategory.delete({ where: { id } });
  }

  async createItem(categoryId: string, data: { name: string; description?: string; price: number; imageUrl?: string }) {
    return this.prisma.menuItem.create({
      data: {
        categoryId,
        ...data,
      },
    });
  }

  async updateItem(id: string, data: { name?: string; description?: string; price?: number; imageUrl?: string; isAvailable?: boolean }) {
    return this.prisma.menuItem.update({
      where: { id },
      data,
    });
  }

  async deleteItem(id: string) {
    return this.prisma.menuItem.delete({ where: { id } });
  }

  async getVendorMenu(vendorId: string) {
    return this.prisma.menuCategory.findMany({
      where: { vendorId, isActive: true },
      include: {
        items: {
          where: { isAvailable: true },
        },
      },
    });
  }
}
