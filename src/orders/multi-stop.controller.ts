import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { MultiStopService } from './multi-stop.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';

@ApiTags('Multi-Stop Rides')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('multi-stop')
export class MultiStopController {
  constructor(private readonly multiStopService: MultiStopService) {}

  @ApiOperation({ summary: '[Customer] Create a multi-stop ride' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['pickupLocation', 'pickupLat', 'pickupLng', 'stops', 'finalDropoffLocation', 'finalDropoffLat', 'finalDropoffLng'],
      properties: {
        pickupLocation: { type: 'string', example: '123 Main St' },
        pickupLat: { type: 'number', example: 9.0820 },
        pickupLng: { type: 'number', example: 8.6753 },
        stops: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'object',
            required: ['address', 'lat', 'lng', 'type'],
            properties: {
              address: { type: 'string', example: '456 Market St' },
              lat: { type: 'number', example: 9.0765 },
              lng: { type: 'number', example: 8.6789 },
              type: { type: 'string', enum: ['pickup', 'dropoff', 'waypoint'], example: 'waypoint' },
              estimatedDuration: { type: 'number', example: 15 }
            }
          }
        },
        finalDropoffLocation: { type: 'string', example: '789 Oak Ave' },
        finalDropoffLat: { type: 'number', example: 9.0700 },
        finalDropoffLng: { type: 'number', example: 8.6820 },
        vehiclePreference: { type: 'string', enum: ['car', 'motorcycle', 'premium'], default: 'car' }
      }
    }
  })
  @Post()
  async createMultiStopRide(@Body() body: any, @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (userRole !== 'customer') {
      throw new Error('Only customers can create multi-stop rides');
    }

    return this.multiStopService.createMultiStopRide({
      ...body,
      customerId: req.user.id
    });
  }

  @ApiOperation({ summary: '[Customer/Rider/Admin] Get multi-stop ride details' })
  @ApiParam({ name: 'orderId', type: 'string' })
  @Get(':orderId')
  async getMultiStopRideDetails(@Param('orderId') orderId: string, @Request() req: any) {
    return this.multiStopService.getMultiStopRideDetails(orderId, req.user.id, req.user.role);
  }

  @ApiOperation({ summary: '[Rider] Update multi-stop ride progress' })
  @ApiParam({ name: 'orderId', type: 'string' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['currentStopIndex', 'stopStatus'],
      properties: {
        currentStopIndex: { type: 'number', example: 1 },
        stopStatus: { type: 'string', enum: ['completed', 'in_progress', 'skipped'], example: 'completed' },
        actualArrivalTime: { type: 'string', example: '2024-01-15T14:30:00Z' },
        notes: { type: 'string', example: 'Customer was ready at pickup location' }
      }
    }
  })
  @Patch(':orderId/progress')
  async updateMultiStopProgress(@Param('orderId') orderId: string, @Body() body: any, @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('rider') && !userRole.includes('driver')) {
      throw new Error('Only riders can update ride progress');
    }

    return this.multiStopService.updateMultiStopProgress(orderId, req.user.id, body);
  }

  @ApiOperation({ summary: '[Customer] Validate multi-stop route before booking' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['pickupLat', 'pickupLng', 'stops', 'finalDropoffLat', 'finalDropoffLng'],
      properties: {
        pickupLat: { type: 'number', example: 9.0820 },
        pickupLng: { type: 'number', example: 8.6753 },
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
        finalDropoffLat: { type: 'number', example: 9.0700 },
        finalDropoffLng: { type: 'number', example: 8.6820 }
      }
    }
  })
  @Post('validate')
  async validateMultiStopRoute(@Body() body: any) {
    return this.multiStopService.validateMultiStopRoute(body);
  }

  @ApiOperation({ summary: '[Admin] Get multi-stop ride statistics' })
  @Get('statistics')
  async getMultiStopStatistics(@Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    return this.multiStopService.getMultiStopStatistics();
  }
}
