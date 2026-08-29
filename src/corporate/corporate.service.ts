import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CorporateService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllAccounts(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    const accounts = await this.prisma.corporateAccount.findMany({ where, orderBy: { createdAt: 'desc' } });
    return accounts.map(a => ({
      id: a.id,
      company: a.company,
      contactPerson: a.contactPerson,
      email: a.email,
      phone: a.phone,
      plan: a.plan || 'Business',
      employees: a.employees,
      monthlyBudget: a.monthlyBudget,
      spent: a.spent,
      totalTrips: a.totalTrips,
      status: a.status,
      city: a.city,
      joinDate: a.joinDate.toISOString(),
    }));
  }

  async createAccount(data: {
    company: string;
    contactPerson: string;
    email: string;
    phone: string;
    city: string;
    employees?: number;
    monthlyBudget?: number;
    plan?: string;
  }) {
    return this.prisma.corporateAccount.create({
      data: {
        company: data.company,
        contactPerson: data.contactPerson,
        email: data.email,
        phone: data.phone,
        city: data.city,
        employees: data.employees || 1,
        monthlyBudget: data.monthlyBudget || 0,
        plan: data.plan || 'Business',
      },
    });
  }

  async getAccount(id: string) {
    const account = await this.prisma.corporateAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Corporate account not found');
    return account;
  }

  async updateAccount(id: string, data: any) {
    await this.getAccount(id);
    return this.prisma.corporateAccount.update({ where: { id }, data });
  }

  async deleteAccount(id: string) {
    await this.getAccount(id);
    return this.prisma.corporateAccount.delete({ where: { id } });
  }
}
