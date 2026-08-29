import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { AppContext } from '../auth/decorators/app-context.decorator';
import { AppType } from '../auth/dto/auth-context.dto';

@ApiBearerAuth()
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Get my loyalty profile' })
  @AppContext(AppType.CUSTOMER)
  @Get('profile/customer')
  async getCustomerLoyaltyProfile(@Request() req: any) {
    return this.loyaltyService.getLoyaltyProfile(req.user.profileId, 'customer');
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Get my loyalty profile' })
  @AppContext(AppType.RIDER)
  @Get('profile/rider')
  async getRiderLoyaltyProfile(@Request() req: any) {
    return this.loyaltyService.getLoyaltyProfile(req.user.profileId, 'rider');
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Get available rewards' })
  @AppContext(AppType.CUSTOMER)
  @Get('rewards/customer')
  async getCustomerRewards(@Request() req: any) {
    const profile = await this.loyaltyService.getLoyaltyProfile(req.user.profileId, 'customer');
    return this.loyaltyService.getAvailableRewards('customer', profile.totalPoints);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Get available rewards' })
  @AppContext(AppType.RIDER)
  @Get('rewards/rider')
  async getRiderRewards(@Request() req: any) {
    const profile = await this.loyaltyService.getLoyaltyProfile(req.user.profileId, 'rider');
    return this.loyaltyService.getAvailableRewards('rider', profile.totalPoints);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Redeem reward' })
  @AppContext(AppType.CUSTOMER)
  @Post('redeem/customer/:rewardId')
  async redeemCustomerReward(@Param('rewardId') rewardId: string, @Request() req: any) {
    return this.loyaltyService.redeemReward(req.user.profileId, 'customer', rewardId);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Redeem reward' })
  @AppContext(AppType.RIDER)
  @Post('redeem/rider/:rewardId')
  async redeemRiderReward(@Param('rewardId') rewardId: string, @Request() req: any) {
    return this.loyaltyService.redeemReward(req.user.profileId, 'rider', rewardId);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Award points' })
  @UseGuards(AuthGuard('jwt'))
  @Post('award-points')
  async awardPoints(@Body() body: any) {
    return this.loyaltyService.awardPoints(body);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Create reward' })
  @UseGuards(AuthGuard('jwt'))
  @Post('rewards')
  async createReward(@Body() body: any) {
    return this.loyaltyService.createReward(body);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Statistics' })
  @UseGuards(AuthGuard('jwt'))
  @Get('statistics')
  async getLoyaltyStatistics() {
    return this.loyaltyService.getLoyaltyStatistics();
  }
}
