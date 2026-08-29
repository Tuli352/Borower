import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('Admin Messages')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @ApiOperation({ summary: '[Admin] List messages in folders' })
  @ApiQuery({ name: 'folder', required: false, description: 'SENT, DRAFT, RECEIVED' })
  @Get()
  findAll(@Query('folder') folder?: string) {
    return this.messagesService.findAll(folder);
  }

  @ApiOperation({ summary: '[Admin] Get message detail' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.messagesService.findOne(id);
  }

  @ApiOperation({ summary: '[Admin] Create a message (Draft or Immediate)' })
  @Post()
  create(@Body() body: { subject: string; content: string; recipient: string; status?: string }) {
    return this.messagesService.create(body);
  }

  @ApiOperation({ summary: '[Admin] Update a message' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.messagesService.update(id, body);
  }

  @ApiOperation({ summary: '[Admin] Send a draft message' })
  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.messagesService.send(id);
  }

  @ApiOperation({ summary: '[Admin] Delete a message' })
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.messagesService.delete(id);
  }

  @ApiOperation({ summary: '[Admin] Mark as read' })
  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.messagesService.markAsRead(id);
  }
}
