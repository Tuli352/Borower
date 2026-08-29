import { Controller, Get, Post, Body, Patch, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @ApiOperation({ summary: '[Admin] Get all global settings' })
  @Get()
  findAll() {
    return this.settingsService.findAll();
  }

  @ApiOperation({ summary: '[Admin] Update global settings' })
  @ApiBody({ schema: { type: 'object', additionalProperties: { type: 'string' }, description: 'Key-value pairs of settings' } })
  @Patch()
  updatePatch(@Body() updateSettingsDto: Record<string, string>) {
    return this.settingsService.update(updateSettingsDto);
  }

  @Post()
  updatePost(@Body() updateSettingsDto: Record<string, string>) {
    return this.settingsService.update(updateSettingsDto);
  }
}
