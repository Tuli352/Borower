import { Controller, Get, Post, Body, Patch, Param, UseGuards, Req } from '@nestjs/common';
import { SupportService } from './support.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';

@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @ApiTags('7. Support')
  @ApiOperation({ summary: '[Any Role] Create a new support ticket' })
  @ApiBody({ schema: { type: 'object', properties: { subject: { type: 'string', example: 'App Crashing' }, message: { type: 'string', example: 'The map does not load on my device' } }, required: ['subject', 'message'] } })
  @Post()
  createTicket(@Body() createTicketDto: any) {
    return this.supportService.createTicket(createTicketDto);
  }

  @Post('tickets')
  createTicketAlias(@Body() createTicketDto: any) {
    return this.supportService.createTicket(createTicketDto);
  }

  @ApiTags('7. Support')
  @ApiOperation({ summary: '[Any Role] Get own support tickets' })
  @Get()
  @Get('my-tickets')
  getMyTickets(@Req() req: any) {
    return this.supportService.findTicketsByUser(req.user.id);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get all support tickets' })
  @Get('tickets')
  findAll() {
    return this.supportService.findAll();
  }

  @ApiTags('7. Support')
  @ApiOperation({ summary: '[Any Role] Get support ticket details and chat history' })
  @ApiParam({ name: 'id', type: 'string' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.supportService.findOne(id);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Update support ticket (Status/Priority)' })
  @ApiParam({ name: 'id', type: 'string' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateData: any) {
    return this.supportService.updateTicket(id, updateData);
  }

  @ApiTags('7. Support')
  @ApiOperation({ summary: '[Any Role] Add a message/chat response to a ticket' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ schema: { type: 'object', properties: { sender: { type: 'string', example: 'Customer Name' }, text: { type: 'string', example: 'Any update on this?' }, action: { type: 'string', example: 'refund' } }, required: ['sender', 'text'] } })
  @Post(':id/messages')
  addMessage(@Param('id') id: string, @Body() body: { sender: string; text: string; action?: string }) {
    return this.supportService.addMessage(id, body.sender, body.text, body.action);
  }
}
