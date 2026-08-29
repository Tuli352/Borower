import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ScheduledRidesService } from './scheduled-rides.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';

@ApiTags('Scheduled Rides')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('scheduled-rides')
export class ScheduledRidesController {
  constructor(private readonly scheduledRidesService: ScheduledRidesService) {}

  @ApiOperation({ summary: '[Customer] Create a scheduled ride' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['pickupLocation', 'pickupLat', 'pickupLng', 'dropoffLocation', 'dropoffLat', 'dropoffLng', 'scheduledAt', 'amount'],
      properties: {
        pickupLocation: { type: 'string', example: '123 Main St' },
        pickupLat: { type: 'number', example: 9.0820 },
        pickupLng: { type: 'number', example: 8.6753 },
        dropoffLocation: { type: 'string', example: '456 Market St' },
        dropoffLat: { type: 'number', example: 9.0765 },
        dropoffLng: { type: 'number', example: 8.6789 },
        scheduledAt: { type: 'string', example: '2024-01-15T14:30:00Z' },
        amount: { type: 'number', example: 1500 },
        stops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: { type: 'string' },
              lat: { type: 'number' },
              lng: { type: 'number' }
            }
          }
        },
        vehiclePreference: { type: 'string', enum: ['car', 'motorcycle', 'premium'], default: 'car' },
        ridePreferences: {
          type: 'object',
          properties: {
            music: { type: 'boolean', default: false },
            temperature: { type: 'string', enum: ['cool', 'warm', 'neutral'], default: 'neutral' },
            conversation: { type: 'boolean', default: true },
            petsAllowed: { type: 'boolean', default: false }
          }
        }
      }
    }
  })
  @Post()
  async createScheduledRide(@Body() body: any, @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (userRole !== 'customer') {
      throw new Error('Only customers can create scheduled rides');
    }

    return this.scheduledRidesService.createScheduledRide({
      ...body,
      customerId: req.user.id
    });
  }

  @ApiOperation({ summary: '[Customer] Get my scheduled rides' })
  @Get('my-rides')
  async getMyScheduledRides(@Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (userRole !== 'customer') {
      throw new Error('Only customers can view their scheduled rides');
    }

    return this.scheduledRidesService.getCustomerScheduledRides(req.user.id);
  }

  @ApiOperation({ summary: '[Customer] Update scheduled ride' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        pickupLocation: { type: 'string' },
        pickupLat: { type: 'number' },
        pickupLng: { type: 'number' },
        dropoffLocation: { type: 'string' },
        dropoffLat: { type: 'number' },
        dropoffLng: { type: 'number' },
        scheduledAt: { type: 'string' },
        amount: { type: 'number' },
        vehiclePreference: { type: 'string' },
        ridePreferences: { type: 'object' }
      }
    }
  })
  @Patch(':id')
  async updateScheduledRide(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (userRole !== 'customer') {
      throw new Error('Only customers can update their scheduled rides');
    }

    return this.scheduledRidesService.updateScheduledRide(id, body, req.user.id);
  }

  @ApiOperation({ summary: '[Customer] Cancel scheduled ride' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', example: 'Change of plans' }
      }
    }
  })
  @Delete(':id')
  async cancelScheduledRide(@Param('id') id: string, @Body() body: { reason: string }, @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (userRole !== 'customer') {
      throw new Error('Only customers can cancel their scheduled rides');
    }

    return this.scheduledRidesService.cancelScheduledRide(id, req.user.id, body.reason);
  }

  @ApiOperation({ summary: '[Admin] Get all scheduled rides' })
  @ApiQuery({ name: 'date', required: false, type: 'string', example: '2024-01-15' })
  @ApiQuery({ name: 'status', required: false, type: 'string' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiQuery({ name: 'offset', required: false, type: 'number' })
  @Get()
  async getAllScheduledRides(@Query() query: any, @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    const filters = {
      date: query.date ? new Date(query.date) : undefined,
      status: query.status,
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined
    };

    return this.scheduledRidesService.getAllScheduledRides(filters);
  }

  @ApiOperation({ summary: '[Admin] Get scheduled rides statistics' })
  @Get('statistics')
  async getScheduledRidesStatistics(@Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    return this.scheduledRidesService.getScheduledRidesStatistics();
  }
}
