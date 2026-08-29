import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FleetService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllVehicles() {
    return this.prisma.fleetVehicle.findMany({
      orderBy: { createdAt: 'desc' },
      include: { transportCompany: true }
    });
  }

  async createVehicle(data: { type: string; model: string; plate: string; location: string }) {
    const existing = await this.prisma.fleetVehicle.findUnique({ where: { plate: data.plate } });
    if (existing) {
      throw new ConflictException('A vehicle with this license plate already exists.');
    }

    return this.prisma.fleetVehicle.create({
      data: {
        type: data.type,
        model: data.model,
        plate: data.plate,
        location: data.location,
        status: 'active',
        fuel: 100.0,
        mileage: 0.0,
      }
    });
  }

  async seedVehicles() {
    // Check if vehicles already exist
    const count = await this.prisma.fleetVehicle.count();
    if (count > 0) {
      return { message: 'Vehicles already seeded' };
    }

    const mockVehicles = [
      { plate: 'KG-234-ABC', type: 'Sedan', model: 'Toyota Corolla 2022', status: 'active', fuel: 78, mileage: 12400, location: 'Lagos' },
      { plate: 'AB-891-XYZ', type: 'SUV', model: 'Toyota Highlander 2023', status: 'active', fuel: 45, mileage: 8200, location: 'Abuja' },
      { plate: 'KN-112-DEF', type: 'Motorcycle', model: 'Bajaj Boxer 2024', status: 'maintenance', fuel: 90, mileage: 24100, location: 'Kano' },
      { plate: 'PH-455-GHI', type: 'Van', model: 'Toyota HiAce 2021', status: 'active', fuel: 32, mileage: 45000, location: 'Port Harcourt' },
      { plate: 'IB-778-JKL', type: 'Sedan', model: 'Honda Civic 2023', status: 'inactive', fuel: 10, mileage: 3500, location: 'Ibadan' },
      { plate: 'LK-990-MNO', type: 'SUV', model: 'Hyundai Tucson 2024', status: 'active', fuel: 60, mileage: 6800, location: 'Lokoja' },
    ];

    await this.prisma.fleetVehicle.createMany({
      data: mockVehicles
    });

    return { message: 'Successfully seeded mock vehicles' };
  }
}
