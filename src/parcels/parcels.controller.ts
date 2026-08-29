import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ParcelsService } from './parcels.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Parcels & Deliveries')
@ApiBearerAuth()
@Controller('parcels')
export class ParcelsController {
  constructor(private readonly parcelsService: ParcelsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all parcels' })
  async getAllParcels(@Query('status') status?: string) {
    return this.parcelsService.getAllParcels(status);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new parcel delivery' })
  async createParcel(@Body() body: {
    sender: string;
    receiver: string;
    pickup: string;
    dropoff: string;
    weight: string;
    fee: number;
    type?: string;
    estimatedDelivery?: string;
  }) {
    return this.parcelsService.createParcel(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific parcel' })
  async getParcel(@Param('id') id: string) {
    return this.parcelsService.getParcel(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a parcel status' })
  async updateParcel(@Param('id') id: string, @Body() body: any) {
    return this.parcelsService.updateParcel(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a parcel' })
  async deleteParcel(@Param('id') id: string) {
    return this.parcelsService.deleteParcel(id);
  }
}
