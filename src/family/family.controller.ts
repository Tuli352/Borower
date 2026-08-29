import { Controller, Post, Get, Delete, Body, Param } from '@nestjs/common';
import { FamilyService } from './family.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Family Accounts')
@Controller('family')
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @Post()
  @ApiOperation({ summary: 'Create a family account' })
  async create(@Body() body: { ownerId: string; name: string }) {
    return this.familyService.createFamilyAccount(body.ownerId, body.name);
  }

  @Get()
  @ApiOperation({ summary: 'List all family accounts (Admin)' })
  async findAll() {
    return this.familyService.findAllFamilyAccounts();
  }

  @Post(':familyAccountId/members')
  @ApiOperation({ summary: 'Add a member to the family account' })
  async addMember(
    @Param('familyAccountId') familyAccountId: string,
    @Body() body: { requesterId: string; targetCustomerId: string },
  ) {
    return this.familyService.addMember(familyAccountId, body.requesterId, body.targetCustomerId);
  }

  @Post(':familyAccountId/members/:customerId/accept')
  @ApiOperation({ summary: 'Accept a family invitation' })
  async acceptInvitation(
    @Param('familyAccountId') familyAccountId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.familyService.acceptInvitation(familyAccountId, customerId);
  }

  @Delete(':familyAccountId/members/:customerId')
  @ApiOperation({ summary: 'Remove a member from the family account' })
  async removeMember(
    @Param('familyAccountId') familyAccountId: string,
    @Param('customerId') customerId: string,
    @Body() body: { requesterId: string },
  ) {
    return this.familyService.removeMember(familyAccountId, body.requesterId, customerId);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get family account for a customer' })
  async getForCustomer(@Param('customerId') customerId: string) {
    return this.familyService.getFamilyAccount(customerId);
  }
}
