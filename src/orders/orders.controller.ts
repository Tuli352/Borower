import { Controller, Get, Post, Body, Patch, Param, UseGuards, Request, UnauthorizedException, Delete } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CancellationService } from './cancellation.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { AppContext } from '../auth/decorators/app-context.decorator';
import { AppType } from '../auth/dto/auth-context.dto';

@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly cancellationService: CancellationService,
  ) {}

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get all orders' })
  @UseGuards(AuthGuard('jwt'))
  @Get()
  async getAllOrders() {
    return this.ordersService.findAll();
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get scheduled rides' })
  @UseGuards(AuthGuard('jwt'))
  @Get('scheduled')
  async getScheduledRides() {
    return this.ordersService.findScheduled();
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Schedule a ride for a customer' })
  @UseGuards(AuthGuard('jwt'))
  @Post('admin/schedule')
  async adminScheduleRide(@Body() body: { customerId: string; pickupLocation: string; dropoffLocation: string; amount: number; scheduledAt: string; vehicleType?: string }) {
    return this.ordersService.createRideOrder(body.customerId, body);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get order by ID' })
  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Update order status' })
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  async updateOrder(@Param('id') id: string, @Body() body: { status: string }) {
    return this.ordersService.updateStatus(id, body.status);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Delete order' })
  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  async deleteOrder(@Param('id') id: string) {
    return this.ordersService.delete(id);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Create a new ride request' })
  @AppContext(AppType.CUSTOMER)
  @Post('ride')
  createRide(@Request() req: any, @Body() body: any) {
    return this.ordersService.createRideOrder(req.user.profileId, body);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Create a new food delivery order' })
  @AppContext(AppType.CUSTOMER)
  @Post('food')
  createFood(@Request() req: any, @Body() body: any) {
    return this.ordersService.createFoodOrder(req.user.profileId, body);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Get my order history' })
  @AppContext(AppType.CUSTOMER)
  @Get('my-rides')
  getMyRides(@Request() req: any) {
    return this.ordersService.findMyRides(req.user.profileId);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Update order status' })
  @AppContext(AppType.RIDER)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }, @Request() req: any) {
    return this.ordersService.updateStatus(id, body.status, req.user.profileId);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Rate a completed order' })
  @AppContext(AppType.CUSTOMER)
  @Post(':id/rate')
  rateOrder(@Param('id') id: string, @Body() body: { rating: number; feedback?: string }) {
    return this.ordersService.rateOrder(id, body);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Cancel an order' })
  @AppContext(AppType.CUSTOMER)
  @Post(':id/cancel/customer')
  async cancelByCustomer(@Param('id') id: string, @Body() body: { reason: string }, @Request() req: any) {
    return this.cancellationService.cancelOrder(id, 'customer', body.reason, req.user.profileId);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Cancel an order' })
  @AppContext(AppType.RIDER)
  @Post(':id/cancel/rider')
  async cancelByRider(@Param('id') id: string, @Body() body: { reason: string }, @Request() req: any) {
    return this.cancellationService.cancelOrder(id, 'rider', body.reason, req.user.profileId);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Confirm cash payment receipt and finalize order' })
  @AppContext(AppType.RIDER)
  @Post(':id/confirm-cash')
  confirmCashPayment(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.confirmCashPayment(id, req.user.profileId);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Public] Get cancellation policy' })
  @Get('cancellation-policy')
  getCancellationPolicy() {
    return this.cancellationService.getCancellationPolicy();
  }
}
