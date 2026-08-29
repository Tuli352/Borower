import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { BroadcastService } from './broadcast.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

@ApiTags('Broadcast Messages')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('broadcast')
export class BroadcastController {
  constructor(private readonly broadcastService: BroadcastService) {}

  @ApiOperation({ summary: '[Admin] Send email broadcast' })
  @ApiBody({ schema: { type: 'object', properties: { target: { type: 'string', description: 'E.g. CUSTOMERS, DRIVERS, VENDORS, ALL' }, subject: { type: 'string' }, message: { type: 'string' } } } })
  @Post('email')
  sendBroadcast(@Body() body: { target: string; subject: string; message: string }) {
    return this.broadcastService.sendBroadcast(body.target, body.subject, body.message);
  }
}
