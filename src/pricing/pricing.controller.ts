import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('estimate')
  @ApiOperation({ summary: 'Get Fare Estimate' })
  @ApiResponse({ status: 200, description: 'Return estimated fare.' })
  async estimateFare(
    @Body() body: { 
       pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number, categoryName?: string, promoCode?: string, stops?: { lat: number; lng: number }[]
    }
  ) {
    const estimate = await this.pricingService.estimateFare(
         body.pickupLat, body.pickupLng, body.dropoffLat, body.dropoffLng, body.categoryName, body.promoCode, body.stops
    );
    return { success: true, message: 'Fare estimated', data: estimate };
  }

  @Get('categories')
  @ApiOperation({ summary: '[Admin] Get All Vehicle Categories' })
  async getCategories() {
    return this.pricingService.findAllCategories();
  }

  @Post('categories')
  @ApiOperation({ summary: '[Admin] Create Vehicle Category' })
  async createCategory(@Body() body: any) {
    return this.pricingService.createCategory(body);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: '[Admin] Update Vehicle Category' })
  async updateCategory(@Param('id') id: string, @Body() body: any) {
    return this.pricingService.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: '[Admin] Delete Vehicle Category' })
  async deleteCategory(@Param('id') id: string) {
    return this.pricingService.deleteCategory(id);
  }
}
