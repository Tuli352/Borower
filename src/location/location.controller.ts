import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { LocationService } from './location.service';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';

@ApiTags('Location Services')
@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get('autocomplete')
  @ApiOperation({ summary: 'Search for addresses (Autocomplete)' })
  @ApiQuery({ name: 'query', example: 'Grand Square' })
  async autocomplete(@Query('query') query: string) {
    if (!query) throw new BadRequestException('Query is required');
    return this.locationService.autocomplete(query);
  }

  @Get('geocode')
  @ApiOperation({ summary: 'Convert address to Lat/Lng' })
  @ApiQuery({ name: 'address', example: 'Lokoja, Kogi State' })
  async geocode(@Query('address') address: string) {
    if (!address) throw new BadRequestException('Address is required');
    return this.locationService.geocode(address);
  }

  @Get('reverse')
  @ApiOperation({ summary: 'Convert Lat/Lng to Address' })
  @ApiQuery({ name: 'lat', example: 7.8023 })
  @ApiQuery({ name: 'lng', example: 6.7333 })
  async reverse(@Query('lat') lat: string, @Query('lng') lng: string) {
    if (!lat || !lng) throw new BadRequestException('Lat and Lng are required');
    return this.locationService.reverseGeocode(Number(lat), Number(lng));
  }
}
