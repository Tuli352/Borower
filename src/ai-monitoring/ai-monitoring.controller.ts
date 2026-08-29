import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { AiMonitoringService } from './ai-monitoring.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('AI Monitoring & Alerts')
@ApiBearerAuth()
@Controller('ai-monitoring')
export class AiMonitoringController {
  constructor(private readonly aiMonitoringService: AiMonitoringService) {}

  @Get('alerts')
  @ApiOperation({ summary: 'Get all AI monitoring alerts' })
  async getAllAlerts(@Query('severity') severity?: string) {
    return this.aiMonitoringService.getAllAlerts(severity);
  }

  @Post('alerts')
  @ApiOperation({ summary: 'Create a new AI alert' })
  async createAlert(@Body() body: {
    type: string;
    title: string;
    description: string;
    confidence: number;
    severity?: string;
    impact?: string;
  }) {
    return this.aiMonitoringService.createAlert(body);
  }

  @Get('alerts/:id')
  @ApiOperation({ summary: 'Get a specific AI alert' })
  async getAlert(@Param('id') id: string) {
    return this.aiMonitoringService.getAlert(id);
  }

  @Patch('alerts/:id/resolve')
  @ApiOperation({ summary: 'Resolve an AI alert' })
  async resolveAlert(@Param('id') id: string) {
    return this.aiMonitoringService.resolveAlert(id);
  }
}
