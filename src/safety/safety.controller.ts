import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { SafetyService } from './safety.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('safety')
@ApiBearerAuth()
@Controller('safety')
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Post('sos/:orderId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Trigger SOS for an active order' })
  async triggerSos(
    @Param('orderId') orderId: string,
    @Req() req: any
  ) {
    return this.safetyService.triggerSos(orderId, req.user.id, req.user.role);
  }

  @Post('contacts')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Add an emergency contact' })
  async addContact(@Req() req: any, @Body() data: { name: string; phone: string }) {
    return this.safetyService.addEmergencyContact(req.user.id, data);
  }

  @Get('contacts')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'List your emergency contacts' })
  async getContacts(@Req() req: any) {
    return this.safetyService.getEmergencyContacts(req.user.id);
  }

  @Post('contacts/:id/remove')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Remove an emergency contact' })
  async removeContact(@Req() req: any, @Param('id') id: string) {
    return this.safetyService.removeEmergencyContact(req.user.id, id);
  }

  @Get('incidents')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get all recent SOS incidents' })
  async getIncidents() {
    return this.safetyService.getIncidents();
  }
}
