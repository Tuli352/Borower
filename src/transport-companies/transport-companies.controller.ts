import { Controller, Post, Get, Body, Param, Patch } from '@nestjs/common';
import { TransportCompaniesService } from './transport-companies.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@ApiTags('Transport Companies (B2B)')
@Controller('transport-companies')
export class TransportCompaniesController {
  constructor(private readonly service: TransportCompaniesService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new transport company' })
  async register(@Body() body: any) {
    return this.service.registerCompany(body);
  }

  @Get()
  @ApiOperation({ summary: 'Get all transport companies (Super Admin)' })
  async getAll() {
    return this.service.getAllCompanies();
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update company status (Super Admin)' })
  async updateStatus(
    @Param('id') id: string, 
    @Body('status') status: string,
    @Body('reason') reason?: string
  ) {
    return this.service.updateCompanyStatus(id, status, reason);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Get dashboard stats for a company' })
  async getDashboard(@Param('id') id: string) {
    return this.service.getCompanyDashboardStats(id);
  }

  @Get(':id/drivers')
  @ApiOperation({ summary: 'Get all drivers for a company' })
  async getDrivers(@Param('id') id: string) {
    return this.service.getCompanyDrivers(id);
  }

  // Vehicles endpoints
  @Get(':id/vehicles')
  @ApiOperation({ summary: 'Get all vehicles for a company' })
  async getVehicles(@Param('id') id: string) {
    return this.service.getCompanyVehicles(id);
  }

  @Post(':id/vehicles')
  @ApiOperation({ summary: 'Create a new vehicle for a company' })
  async createVehicle(@Param('id') id: string, @Body() dto: CreateVehicleDto) {
    return this.service.createVehicle(id, dto);
  }

  @Patch('vehicles/:vehicleId')
  @ApiOperation({ summary: 'Update a vehicle' })
  async updateVehicle(@Param('vehicleId') vehicleId: string, @Body() dto: UpdateVehicleDto) {
    return this.service.updateVehicle(vehicleId, dto);
  }

  @Patch('vehicles/:vehicleId/delete')
  @ApiOperation({ summary: 'Delete a vehicle' })
  async deleteVehicle(@Param('vehicleId') vehicleId: string) {
    return this.service.deleteVehicle(vehicleId);
  }

  // Earnings endpoint
  @Get(':id/earnings')
  @ApiOperation({ summary: 'Get earnings summary for a company' })
  async getEarnings(@Param('id') id: string) {
    return this.service.getCompanyEarnings(id);
  }

  // Company settings update
  @Patch(':id')
  @ApiOperation({ summary: 'Update company profile/settings' })
  async updateCompany(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.service.updateCompany(id, dto);
  }
}

