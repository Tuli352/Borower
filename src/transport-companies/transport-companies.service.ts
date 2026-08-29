import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class TransportCompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async registerCompany(data: { name: string; email: string; phone: string; adminName: string; adminPassword: string }) {
    const existing = await this.prisma.transportCompany.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('Company with this email already exists.');

    // Note: In production, hash the password. For now, matching existing simple auth patterns.
    return this.prisma.transportCompany.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        admins: {
          create: {
            name: data.adminName,
            email: data.email, // using company email for the primary admin for now
            password: data.adminPassword,
          }
        }
      },
      include: { admins: true }
    });
  }

  async getAllCompanies() {
    return this.prisma.transportCompany.findMany({
      include: {
        _count: {
          select: { drivers: true, vehicles: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getCompanyDashboardStats(companyId: string) {
    const company = await this.prisma.transportCompany.findUnique({
      where: { id: companyId },
      include: {
        _count: {
          select: { drivers: true, vehicles: true }
        }
      }
    });

    if (!company) throw new NotFoundException('Company not found');

    const drivers = await this.prisma.rider.findMany({
      where: { transportCompanyId: companyId }
    });

    const totalDriverEarnings = drivers.reduce((acc, driver) => acc + driver.earnings, 0);
    const totalDriverRides = drivers.reduce((acc, driver) => acc + driver.rides, 0);

    return {
      company,
      totalDriverEarnings,
      totalDriverRides,
      activeDrivers: drivers.filter(d => d.status === 'ACTIVE').length,
    };
  }

  async getCompanyDrivers(companyId: string) {
    return this.prisma.rider.findMany({
      where: { transportCompanyId: companyId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async updateCompanyStatus(companyId: string, status: string, reason?: string) {
    const updated = await this.prisma.transportCompany.update({
      where: { id: companyId },
      data: { 
        status,
        rejectionReason: status === 'REJECTED' ? reason : null
      }
    });

    if (status === 'ACTIVE') {
      await this.mailService.sendGenericEmail(
        updated.email,
        'Application Approved - Kogi Ride Partner',
        'Partner Application Approved',
        `Congratulations ${updated.name}! Your application to become a transport partner on Kogi Ride has been approved. You can now log into your Partner Portal to manage your fleet and drivers.`
      );
    } else if (status === 'REJECTED') {
      await this.mailService.sendGenericEmail(
        updated.email,
        'Application Update - Kogi Ride Partner',
        'Partner Application Update',
        `Hello ${updated.name},<br><br>Thank you for your interest in joining Kogi Ride as a transport partner. Unfortunately, we are unable to approve your application at this time.<br><br><b>Reason:</b> ${reason || 'Does not meet platform requirements at this time.'}<br><br>If you have any questions, please contact our support team.`
      );
    }

    return updated;
  }

  // ----- New Methods -----

  // Vehicles CRUD
  async getCompanyVehicles(companyId: string) {
    return this.prisma.fleetVehicle.findMany({
      where: { transportCompanyId: companyId },
    });
  }

  async createVehicle(companyId: string, dto: CreateVehicleDto) {
    const existing = await this.prisma.fleetVehicle.findUnique({ where: { plate: dto.plate } });
    if (existing) throw new ConflictException('Vehicle with this plate already exists.');
    const data = {
      plate: dto.plate,
      driverId: dto.driverId,
      type: dto.type,
      model: dto.model ?? '',
      fuel: dto.fuel,
      location: dto.location ?? '',
      transportCompanyId: companyId,
    };
    return this.prisma.fleetVehicle.create({ data });
  }

  async updateVehicle(vehicleId: string, dto: UpdateVehicleDto) {
    return this.prisma.fleetVehicle.update({
      where: { id: vehicleId },
      data: dto,
    });
  }

  async deleteVehicle(vehicleId: string) {
    return this.prisma.fleetVehicle.delete({ where: { id: vehicleId } });
  }

  // Company earnings aggregation
  async getCompanyEarnings(companyId: string) {
    const drivers = await this.prisma.rider.findMany({
      where: { transportCompanyId: companyId },
    });
    const totalEarnings = drivers.reduce((sum, d) => sum + d.earnings, 0);
    const totalRides = drivers.reduce((sum, d) => sum + d.rides, 0);
    return { totalEarnings, totalRides };
  }

  // Update company profile (settings)
  async updateCompany(companyId: string, dto: UpdateCompanyDto) {
    return this.prisma.transportCompany.update({
      where: { id: companyId },
      data: dto,
    });
  }

}
