import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { PromosService } from './promos.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('promos')
export class PromosController {
  constructor(private readonly promosService: PromosService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Get all promo codes' })
  findAll() {
    return this.promosService.findAll();
  }

  @Post()
  @ApiOperation({ summary: '[Admin] Create a promo code' })
  create(@Body() body: any) {
    return this.promosService.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Update promo status' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.promosService.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[Admin] Delete promo code' })
  remove(@Param('id') id: string) {
    return this.promosService.delete(id);
  }

  @Get('referrals')
  @ApiOperation({ summary: '[Admin] Get referral statistics' })
  getReferralStats() {
    return this.promosService.getReferralStats();
  }
}
