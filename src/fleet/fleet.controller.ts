import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FleetService } from './fleet.service';

@ApiTags('Fleet Management')
@Controller('fleet')
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get('vehicles')
  @ApiOperation({ summary: 'Get all fleet vehicles' })
  async getAllVehicles() {
    return this.fleetService.getAllVehicles();
  }

  @Post('vehicles')
  @ApiOperation({ summary: 'Add a new vehicle to the fleet' })
  async createVehicle(@Body() body: { type: string; model: string; plate: string; location: string }) {
    return this.fleetService.createVehicle(body);
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed mock vehicles for testing' })
  async seedVehicles() {
    return this.fleetService.seedVehicles();
  }
}
