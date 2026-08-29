import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOne(email: string) {
    return this.prisma.adminUser.findUnique({ where: { email } });
  }

  async createAdmin(data: any) {
    const existing = await this.findOne(data.email);
    if (existing) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.prisma.adminUser.create({
      data: {
        ...data,
        password: hashedPassword,
      },
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    });
  }

  async findAll() {
    return this.prisma.adminUser.findMany({
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    });
  }
}
