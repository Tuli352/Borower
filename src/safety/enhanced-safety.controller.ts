import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { EnhancedSafetyService } from './enhanced-safety.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';

@ApiTags('Enhanced Safety')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('safety')
export class EnhancedSafetyController {
  constructor(private readonly enhancedSafetyService: EnhancedSafetyService) {}

  @ApiOperation({ summary: '[Customer/Rider] Share trip with emergency contacts' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['orderId', 'contactIds'],
      properties: {
        orderId: { type: 'string', example: 'uuid-order-123' },
        contactIds: { type: 'array', items: { type: 'string' }, example: ['contact-1', 'contact-2'] },
        message: { type: 'string', example: 'I am sharing my trip location with you for safety.' },
        duration: { type: 'number', example: 24, description: 'Sharing duration in hours' }
      }
    }
  })
  @Post('share-trip')
  async shareTripWithContacts(@Body() body: any, @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    const userType = userRole === 'customer' ? 'customer' : 'rider';
    
    if (!['customer', 'rider'].includes(userType)) {
      throw new Error('Only customers and riders can share trips');
    }

    return this.enhancedSafetyService.shareTripWithContacts({
      ...body,
      userId: req.user.id,
      userType
    });
  }

  @ApiOperation({ summary: '[Customer/Rider] Get active trip shares' })
  @Get('trip-shares')
  async getActiveTripShares(@Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    const userType = userRole === 'customer' ? 'customer' : 'rider';
    
    if (!['customer', 'rider'].includes(userType)) {
      throw new Error('Only customers and riders can view trip shares');
    }

    return this.enhancedSafetyService.getActiveTripShares(req.user.id, userType);
  }

  @ApiOperation({ summary: '[Customer/Rider] Revoke trip sharing' })
  @ApiParam({ name: 'shareId', type: 'string' })
  @Delete('trip-shares/:shareId')
  async revokeTripSharing(@Param('shareId') shareId: string, @Request() req: any) {
    return this.enhancedSafetyService.revokeTripSharing(shareId, req.user.id);
  }

  @ApiOperation({ summary: '[Customer/Rider] Trigger enhanced SOS alert' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['orderId', 'emergencyType', 'location'],
      properties: {
        orderId: { type: 'string', example: 'uuid-order-123' },
        emergencyType: { type: 'string', enum: ['medical', 'accident', 'harassment', 'theft', 'other'], example: 'accident' },
        location: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number', example: 9.0820 },
            lng: { type: 'number', example: 8.6753 },
            address: { type: 'string', example: '123 Main St, Kogi' }
          }
        },
        description: { type: 'string', example: 'I was involved in a minor accident and need help.' },
        media: {
          type: 'object',
          properties: {
            images: { type: 'array', items: { type: 'string' } },
            videos: { type: 'array', items: { type: 'string' } },
            audio: { type: 'array', items: { type: 'string' } }
          }
        },
        immediateDanger: { type: 'boolean', example: false }
      }
    }
  })
  @Post('sos')
  async triggerEnhancedSOS(@Body() body: any, @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    const userType = userRole === 'customer' ? 'customer' : 'rider';
    
    if (!['customer', 'rider'].includes(userType)) {
      throw new Error('Only customers and riders can trigger SOS alerts');
    }

    return this.enhancedSafetyService.triggerEnhancedSOS({
      ...body,
      userId: req.user.id,
      userType
    });
  }

  @ApiOperation({ summary: '[Customer/Rider/Admin] Get SOS incident details' })
  @ApiParam({ name: 'incidentId', type: 'string' })
  @Get('sos/:incidentId')
  async getSOSIncident(@Param('incidentId') incidentId: string, @Request() req: any) {
    return this.enhancedSafetyService.getSOSIncident(incidentId, req.user.id, req.user.role);
  }

  @ApiOperation({ summary: '[Admin] Update SOS incident status' })
  @ApiParam({ name: 'incidentId', type: 'string' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['active', 'investigating', 'resolved', 'false_alarm'], example: 'resolved' },
        notes: { type: 'string', example: 'User was safely assisted and is now fine.' }
      }
    }
  })
  @Patch('sos/:incidentId')
  async updateSOSIncident(
    @Param('incidentId') incidentId: string,
    @Body() body: { status: string; notes?: string },
    @Request() req: any
  ) {
    return this.enhancedSafetyService.updateSOSIncident(incidentId, body.status, req.user.id, req.user.role, body.notes);
  }

  @ApiOperation({ summary: '[Admin] Get SOS statistics' })
  @Get('sos/statistics')
  async getSOSStatistics(@Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    return this.enhancedSafetyService.getSOSStatistics();
  }

  @ApiOperation({ summary: '[Public] Get public trip share link' })
  @ApiParam({ name: 'shareId', type: 'string' })
  @Get('share/:shareId')
  async getPublicTripShare(@Param('shareId') shareId: string) {
    // This would be a public endpoint for tracking shared trips
    // Implementation would validate the share ID and return location data
    return { message: 'Public trip share endpoint - would return live location data' };
  }

  @ApiOperation({ summary: '[Public] Get public SOS tracking link' })
  @ApiParam({ name: 'incidentId', type: 'string' })
  @Get('sos-track/:incidentId')
  async getPublicSOSTrack(@Param('incidentId') incidentId: string) {
    // This would be a public endpoint for tracking SOS incidents
    // Implementation would validate the incident ID and return location data
    return { message: 'Public SOS tracking endpoint - would return live location data' };
  }
}
