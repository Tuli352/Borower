import { Controller, Post, Get, Put, Delete, Body, Param } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // ─── Admin: Plan Management ────────────────────────────────────────────

  @Post('plans')
  @ApiOperation({ summary: 'Create a new subscription plan (Admin)' })
  async createPlan(@Body() body: any) {
    return this.subscriptionsService.createPlan(body);
  }

  @Get('plans')
  @ApiOperation({ summary: 'List all active subscription plans' })
  async listPlans() {
    return this.subscriptionsService.findAllPlans();
  }

  @Get('subscribers')
  @ApiOperation({ summary: 'List all active subscribers (Admin)' })
  async listSubscribers() {
    return this.subscriptionsService.findAllSubscribers();
  }

  @Put('plans/:id')
  @ApiOperation({ summary: 'Update a subscription plan (Admin)' })
  async updatePlan(@Param('id') id: string, @Body() body: any) {
    return this.subscriptionsService.updatePlan(id, body);
  }

  @Delete('plans/:id')
  @ApiOperation({ summary: 'Deactivate a subscription plan (Admin)' })
  async deletePlan(@Param('id') id: string) {
    return this.subscriptionsService.deletePlan(id);
  }

  // ─── Driver: Subscribe ──────────────────────────────────────────────────

  @Post('riders/:riderId/subscribe')
  @ApiOperation({ summary: 'Subscribe a rider to a plan' })
  async subscribeRider(
    @Param('riderId') riderId: string,
    @Body() body: { planId: string },
  ) {
    return this.subscriptionsService.subscribeRider(riderId, body.planId);
  }

  @Get('riders/:riderId/status')
  @ApiOperation({ summary: 'Get rider subscription status' })
  async getRiderSubscription(@Param('riderId') riderId: string) {
    return this.subscriptionsService.getRiderSubscription(riderId);
  }
}
