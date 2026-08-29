import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { InterStateService } from './inter-state.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Inter-State Routes')
@ApiBearerAuth()
@Controller('inter-state')
export class InterStateController {
  constructor(private readonly interStateService: InterStateService) {}

  @Get('routes')
  @ApiOperation({ summary: 'Get all inter-state routes' })
  async getAllRoutes(@Query('status') status?: string) {
    return this.interStateService.getAllRoutes(status);
  }

  @Post('routes')
  @ApiOperation({ summary: 'Create a new inter-state route' })
  async createRoute(@Body() body: {
    fromCity: string;
    toCity: string;
    distance: string;
    duration: string;
    price: number;
    stops?: string;
  }) {
    return this.interStateService.createRoute(body);
  }

  @Get('routes/:id')
  @ApiOperation({ summary: 'Get a specific route' })
  async getRoute(@Param('id') id: string) {
    return this.interStateService.getRoute(id);
  }

  @Patch('routes/:id')
  @ApiOperation({ summary: 'Update a route' })
  async updateRoute(@Param('id') id: string, @Body() body: any) {
    return this.interStateService.updateRoute(id, body);
  }

  @Delete('routes/:id')
  @ApiOperation({ summary: 'Delete a route' })
  async deleteRoute(@Param('id') id: string) {
    return this.interStateService.deleteRoute(id);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get inter-state route statistics' })
  async getStatistics() {
    return this.interStateService.getStatistics();
  }
}
