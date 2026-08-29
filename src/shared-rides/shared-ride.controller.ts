import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { SharedRideService } from './shared-ride.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Shared Rides')
@Controller('shared-rides')
export class SharedRideController {
  constructor(private readonly sharedRideService: SharedRideService) {}

  @Post('pools')
  @ApiOperation({ summary: 'Create a shared ride pool (Driver)' })
  async createPool(@Body() body: { driverId: string; totalSeats: number; routeData: any }) {
    return this.sharedRideService.createPool(body.driverId, body);
  }

  @Get('pools/all')
  @ApiOperation({ summary: 'Admin: Get all shared ride pools' })
  async getAllPools() {
    return this.sharedRideService.getAllPools();
  }

  @Get('pools/available')
  @ApiOperation({ summary: 'Find available shared ride pools near a location' })
  async findAvailablePools(
    @Query('pickupLat') pickupLat: string,
    @Query('pickupLng') pickupLng: string,
    @Query('seats') seats: string,
  ) {
    return this.sharedRideService.findAvailablePools(
      parseFloat(pickupLat),
      parseFloat(pickupLng),
      parseInt(seats || '1'),
    );
  }

  @Post('pools/:poolId/book')
  @ApiOperation({ summary: 'Book seats in a shared ride pool' })
  async bookSharedRide(@Param('poolId') poolId: string, @Body() body: any) {
    return this.sharedRideService.bookSharedRide(poolId, body.customerId, body);
  }

  @Post('pools/:poolId/close')
  @ApiOperation({ summary: 'Close a shared ride pool (Driver)' })
  async closePool(@Param('poolId') poolId: string, @Body() body: { driverId: string }) {
    return this.sharedRideService.closePool(poolId, body.driverId);
  }
}
