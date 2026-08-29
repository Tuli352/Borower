import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SearchService } from './search.service';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('Search')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @ApiOperation({ summary: '[Admin] Global search across all entities' })
  @ApiQuery({ name: 'q', type: 'string', description: 'Search query' })
  @Get()
  search(@Query('q') query: string) {
    return this.searchService.searchAll(query);
  }
}
