import { Controller, Post, Body, Param, Get, UseGuards, Req } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Logistics / Delivery')
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Post('parcel')
  @ApiOperation({ summary: 'Create a parcel delivery order' })
  async createParcelDelivery(@Body() body: any) {
    return this.deliveryService.createParcelDelivery(body.customerId, body);
  }

  @Post(':orderId/verify')
  @ApiOperation({ summary: 'Verify delivery code and complete delivery' })
  async verifyDelivery(
    @Param('orderId') orderId: string,
    @Body() body: { riderId: string; verificationCode: string },
  ) {
    return this.deliveryService.verifyAndCompleteDelivery(orderId, body.riderId, body.verificationCode);
  }

  @Get(':orderId/details')
  @ApiOperation({ summary: 'Get delivery tracking details' })
  async getDeliveryDetails(@Param('orderId') orderId: string) {
    return this.deliveryService.getDeliveryDetails(orderId);
  }
}
