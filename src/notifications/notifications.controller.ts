import { Controller, Get, Post, Patch, Param, Delete, UseGuards, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: '[Admin] Get all notifications' })
  @Get()
  findAll() {
    return this.notificationsService.findAll();
  }

  @ApiOperation({ summary: '[Admin] Send a manual system-wide in-app alert' })
  @ApiBody({ schema: { type: 'object', properties: { title: { type: 'string', example: 'System Maintenance' }, message: { type: 'string', example: 'The platform will be down for 2 hours tonight.' }, type: { type: 'string', description: 'e.g. order, rider, alert, system', example: 'alert' } } } })
  @Post()
  create(@Body() body: { title: string; message: string; type: string }) {
    return this.notificationsService.create(body);
  }

  @ApiOperation({ summary: '[Admin] Mark a notification as read' })
  @ApiParam({ name: 'id', type: 'string' })
  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @ApiOperation({ summary: '[Admin] Mark all notifications as read' })
  @Post('mark-all-read')
  markAllAsRead() {
    return this.notificationsService.markAllAsRead();
  }

  @ApiOperation({ summary: '[Admin] Delete a notification' })
  @ApiParam({ name: 'id', type: 'string' })
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.notificationsService.delete(id);
  }
}
