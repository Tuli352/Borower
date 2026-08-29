import { Controller, Get, Post, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { RidePreferencesService } from './ride-preferences.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

@ApiTags('Ride Preferences')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('preferences')
export class RidePreferencesController {
  constructor(private readonly ridePreferencesService: RidePreferencesService) {}

  @ApiOperation({ summary: '[Customer/Rider] Get my ride preferences' })
  @Get()
  async getMyPreferences(@Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    const userType = userRole === 'customer' ? 'customer' : 'rider';
    
    if (!['customer', 'rider'].includes(userType)) {
      throw new Error('Only customers and riders have ride preferences');
    }

    return this.ridePreferencesService.getUserPreferences(req.user.id, userType);
  }

  @ApiOperation({ summary: '[Customer/Rider] Update ride preferences' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        vehicleType: { type: 'string', enum: ['car', 'motorcycle', 'premium', 'suv', 'van'], example: 'car' },
        temperature: { type: 'string', enum: ['cool', 'warm', 'neutral'], example: 'neutral' },
        music: { type: 'boolean', example: false },
        conversation: { type: 'boolean', example: true },
        petsAllowed: { type: 'boolean', example: false },
        smokingAllowed: { type: 'boolean', example: false },
        accessibilityNeeds: { 
          type: 'array', 
          items: { type: 'string', enum: ['wheelchair_access', 'hearing_impaired', 'visually_impaired', 'elderly_assistance'] }
        },
        luggageSpace: { type: 'string', enum: ['small', 'medium', 'large', 'extra_large'], example: 'medium' },
        preferredAreas: { type: 'array', items: { type: 'string' } },
        avoidedAreas: { type: 'array', items: { type: 'string' } },
        workSchedule: {
          type: 'object',
          properties: {
            monday: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
            tuesday: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
            wednesday: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
            thursday: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
            friday: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
            saturday: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
            sunday: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } }
          }
        },
        maxTripDistance: { type: 'number', example: 50 },
        paymentMethods: { type: 'array', items: { type: 'string', enum: ['wallet', 'bank_transfer', 'cash', 'crypto'] } }
      }
    }
  })
  @Patch()
  async updatePreferences(@Body() body: any, @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    const userType = userRole === 'customer' ? 'customer' : 'rider';
    
    if (!['customer', 'rider'].includes(userType)) {
      throw new Error('Only customers and riders can update preferences');
    }

    return this.ridePreferencesService.updatePreferences(req.user.id, userType, body);
  }

  @ApiOperation({ summary: '[Customer/Rider] Reset preferences to default' })
  @Post('reset')
  async resetPreferences(@Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    const userType = userRole === 'customer' ? 'customer' : 'rider';
    
    if (!['customer', 'rider'].includes(userType)) {
      throw new Error('Only customers and riders can reset preferences');
    }

    return this.ridePreferencesService.resetPreferences(req.user.id, userType);
  }

  @ApiOperation({ summary: '[Admin] Get preference statistics' })
  @Get('statistics')
  async getPreferenceStatistics(@Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    return this.ridePreferencesService.getPreferenceStatistics();
  }

  @ApiOperation({ summary: '[Customer/Rider] Get available preference options' })
  @Get('options')
  async getAvailablePreferences() {
    return this.ridePreferencesService.getAvailablePreferences();
  }
}
