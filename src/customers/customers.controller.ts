import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AppContext } from '../auth/decorators/app-context.decorator';
import { AppType } from '../auth/dto/auth-context.dto';
import { RedeemReferralDto } from './dto/redeem-referral.dto';

@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Create a new customer' })
  @UseGuards(AuthGuard('jwt'))
  @Post()
  async create(@Body() data: { accountId?: string } & any) {
    const { accountId, ...rest } = data;
    return this.customersService.create(rest, accountId);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get all customers' })
  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll() {
    return this.customersService.findAll();
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Get own profile' })
  @AppContext(AppType.CUSTOMER)
  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.customersService.findOne(req.user.profileId);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Update own profile' })
  @AppContext(AppType.CUSTOMER)
  @Patch('profile')
  async updateProfile(@Request() req: any, @Body() updateData: any) {
    return this.customersService.update(req.user.profileId, updateData);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Redeem a referral code' })
  @ApiBody({ type: RedeemReferralDto })
  @AppContext(AppType.CUSTOMER)
  @Post('profile/referral')
  @HttpCode(HttpStatus.OK)
  async redeemReferral(@Request() req: any, @Body() body: RedeemReferralDto) {
    return this.customersService.redeemReferral(
      req.user.profileId,
      body?.code,
    );
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Add a saved location' })
  @AppContext(AppType.CUSTOMER)
  @Post('profile/locations')
  async addLocation(@Request() req: any, @Body() data: any) {
    return this.customersService.addSavedLocation(req.user.profileId, data);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Get all saved locations' })
  @AppContext(AppType.CUSTOMER)
  @Get('profile/locations')
  async getLocations(@Request() req: any) {
    return this.customersService.getSavedLocations(req.user.profileId);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Remove a saved location' })
  @AppContext(AppType.CUSTOMER)
  @Delete('profile/locations/:id')
  async removeLocation(@Request() req: any, @Param('id') id: string) {
    return this.customersService.removeSavedLocation(req.user.profileId, id);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Subscribe to Kogi Plus' })
  @AppContext(AppType.CUSTOMER)
  @Post('profile/plus')
  async subscribePlus(@Request() req: any) {
    return this.customersService.subscribeToPlus(req.user.profileId);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Wallet balance' })
  @AppContext(AppType.CUSTOMER)
  @Get('wallet')
  async getWallet(@Request() req: any) {
    return this.customersService.getWallet(req.user.profileId);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Wallet transactions' })
  @AppContext(AppType.CUSTOMER)
  @Get('wallet/transactions')
  async getWalletTransactions(
    @Request() req: any,
    @Query('limit') limit: string,
    @Query('page') page: string,
  ) {
    return this.customersService.getWalletTransactions(
      req.user.profileId,
      Number(limit || 50),
      Number(page || 1),
    );
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get customer by ID' })
  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Update customer by ID' })
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateData: any) {
    return this.customersService.update(id, updateData);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Delete customer by ID' })
  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.customersService.delete(id);
  }
}
