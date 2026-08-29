import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Request, BadRequestException } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { AppContext } from '../auth/decorators/app-context.decorator';
import { AppType } from '../auth/dto/auth-context.dto';

@ApiBearerAuth()
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Create a new vendor' })
  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Body() data: { accountId?: string } & any) {
    const { accountId, ...rest } = data;
    return this.vendorsService.create(rest, accountId);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get all vendors' })
  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll() {
    return this.vendorsService.findAll();
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Get nearby vendors' })
  @Get('nearby')
  async getNearbyVendors(@Query('lat') lat: string, @Query('lng') lng: string, @Query('category') category: string) {
    return this.vendorsService.findNearby(lat ? Number(lat) : undefined, lng ? Number(lng) : undefined, category);
  }

  @ApiTags('Vendor App')
  @ApiOperation({ summary: '[Vendor] Get own profile' })
  @AppContext(AppType.VENDOR)
  @Get('profile')
  getOwnProfile(@Request() req: any) {
    return this.vendorsService.findOne(req.user.profileId);
  }

  @ApiTags('Vendor App')
  @ApiOperation({ summary: '[Vendor] Update own profile' })
  @AppContext(AppType.VENDOR)
  @Patch('profile')
  updateOwnProfile(@Request() req: any, @Body() updateData: any) {
    return this.vendorsService.update(req.user.profileId, updateData);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Delete vendor by ID' })
  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.vendorsService.delete(id);
  }
}
