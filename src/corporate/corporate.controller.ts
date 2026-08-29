import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { CorporateService } from './corporate.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Corporate Accounts')
@ApiBearerAuth()
@Controller('corporate')
export class CorporateController {
  constructor(private readonly corporateService: CorporateService) {}

  @Get()
  @ApiOperation({ summary: 'Get all corporate accounts' })
  async getAllAccounts(@Query('status') status?: string) {
    return this.corporateService.getAllAccounts(status);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new corporate account' })
  async createAccount(@Body() body: {
    company: string;
    contactPerson: string;
    email: string;
    phone: string;
    city: string;
    employees?: number;
    monthlyBudget?: number;
    plan?: string;
  }) {
    return this.corporateService.createAccount(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific corporate account' })
  async getAccount(@Param('id') id: string) {
    return this.corporateService.getAccount(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a corporate account' })
  async updateAccount(@Param('id') id: string, @Body() body: any) {
    return this.corporateService.updateAccount(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a corporate account' })
  async deleteAccount(@Param('id') id: string) {
    return this.corporateService.deleteAccount(id);
  }
}
