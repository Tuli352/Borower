import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { RouteOptimizationService } from './route-optimization.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';

@ApiTags('Route Optimization')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('routes')
export class RouteOptimizationController {
  constructor(private readonly routeOptimizationService: RouteOptimizationService) {}

  @ApiOperation({ summary: '[Customer/Rider] Optimize route with multiple stops' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['pickupLat', 'pickupLng', 'dropoffLat', 'dropoffLng'],
      properties: {
        pickupLat: { type: 'number', example: 9.0820 },
        pickupLng: { type: 'number', example: 8.6753 },
        dropoffLat: { type: 'number', example: 9.0765 },
        dropoffLng: { type: 'number', example: 8.6789 },
        stops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              lat: { type: 'number' },
              lng: { type: 'number' },
              address: { type: 'string' }
            }
          }
        },
        avoidTolls: { type: 'boolean', default: false },
        avoidHighways: { type: 'boolean', default: false },
        vehicleType: { type: 'string', default: 'car', enum: ['car', 'motorcycle', 'bicycle'] }
      }
    }
  })
  @Post('optimize')
  async optimizeRoute(@Body() body: any) {
    return this.routeOptimizationService.optimizeRoute(body);
  }

  @ApiOperation({ summary: '[Customer/Rider] Get real-time traffic updates' })
  @ApiQuery({ name: 'pickupLat', type: 'number', required: true })
  @ApiQuery({ name: 'pickupLng', type: 'number', required: true })
  @ApiQuery({ name: 'dropoffLat', type: 'number', required: true })
  @ApiQuery({ name: 'dropoffLng', type: 'number', required: true })
  @Get('traffic')
  async getTrafficUpdates(
    @Query('pickupLat') pickupLat: number,
    @Query('pickupLng') pickupLng: number,
    @Query('dropoffLat') dropoffLat: number,
    @Query('dropoffLng') dropoffLng: number
  ) {
    return this.routeOptimizationService.getTrafficUpdates({
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng
    });
  }

  @ApiOperation({ summary: '[Customer/Rider] Get route alternatives' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['pickupLat', 'pickupLng', 'dropoffLat', 'dropoffLng'],
      properties: {
        pickupLat: { type: 'number' },
        pickupLng: { type: 'number' },
        dropoffLat: { type: 'number' },
        dropoffLng: { type: 'number' },
        alternatives: { type: 'boolean', default: true }
      }
    }
  })
  @Post('alternatives')
  async getRouteAlternatives(@Body() body: any) {
    const result = await this.routeOptimizationService.optimizeRoute(body);
    return {
      primary: result.optimizedRoute,
      alternatives: result.alternatives
    };
  }
}
