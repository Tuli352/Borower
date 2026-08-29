import { Controller, Get, Post, Body, Patch, Param, UseGuards, Query, BadRequestException, Request, Headers } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';

@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiTags('6. Payments')
  @ApiOperation({ summary: '[Customer] Create a payment intent' })
  @ApiBody({ schema: { type: 'object', properties: { orderId: { type: 'string', example: 'uuid-123' }, amount: { type: 'number', example: 50.00 }, method: { type: 'string', example: 'Paystack' } }, required: ['orderId', 'amount', 'method'] } })
  @Post()
  create(@Body() createPaymentDto: any, @Request() req: any) {
    return this.paymentsService.create(createPaymentDto, req.user?.email);
  }

  @ApiTags('6. Payments')
  @ApiOperation({ summary: '[Customer] Verify payment via reference' })
  @ApiBody({ schema: { type: 'object', properties: { reference: { type: 'string', example: 'pay_ref_123456789' } }, required: ['reference'] } })
  @Post('verify')
  verifyPayment(@Body('reference') reference: string) {
    return this.paymentsService.verifyPayment(reference);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get all platform payments' })
  @Get()
  findAll() {
    return this.paymentsService.findAll();
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get all Paystack transactions directly' })
  @Get('paystack-transactions')
  getPaystackTransactions(@Query('page') page?: string, @Query('perPage') perPage?: string, @Query('status') status?: string) {
    return this.paymentsService.getPaystackTransactions({ 
      page: page ? parseInt(page, 10) : undefined, 
      perPage: perPage ? parseInt(perPage, 10) : undefined,
      status 
    });
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get payment by ID' })
  @ApiParam({ name: 'id', type: 'string' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Update payment status' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ schema: { type: 'object', properties: { status: { type: 'string' } } } })
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.paymentsService.updateStatus(id, status);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get Admin Wallet summary' })
  @Get('admin-wallet')
  getAdminWallet() {
    return this.paymentsService.getAdminWallet();
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Withdraw commissions to bank' })
  @Post('admin-wallet/withdraw')
  withdrawCommission(@Body() body: { amount: number; bankCode: string; accountNumber: string; accountName: string }) {
    return this.paymentsService.withdrawCommission(body);
  }

  @ApiTags('6. Payments')
  @ApiOperation({ summary: '[Callback] Paystack Webhook' })
  @UseGuards() // Bypasses the class-level AuthGuard because it's an empty guard
  @Post('webhook')
  handleWebhook(@Body() body: any, @Headers('x-paystack-signature') signature: string) {
    return this.paymentsService.handleWebhook(body, signature);
  }

  @ApiTags('6. Payments')
  @ApiOperation({ summary: '[Partner] Request a payout' })
  @Post('payouts')
  requestPayout(@Body() body: { riderId?: string; vendorId?: string; amount: number; bankName: string; bankCode: string; accountNumber: string; accountName: string }) {
    return this.paymentsService.requestPayout(body);
  }

  @ApiTags('6. Payments')
  @ApiOperation({ summary: '[Partner] Get payout history' })
  @Get('payouts/history')
  getPayouts(@Query('riderId') riderId?: string, @Query('vendorId') vendorId?: string) {
    return this.paymentsService.getPayoutRequests(riderId, vendorId);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Approve a payout' })
  @Post('payouts/:id/approve')
  approvePayout(@Param('id') id: string) {
    return this.paymentsService.approvePayout(id);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Manually fund a user wallet' })
  @ApiBody({ schema: { type: 'object', properties: { userId: { type: 'string' }, userType: { type: 'string', enum: ['Customer', 'Rider', 'Vendor'] }, amount: { type: 'number' }, description: { type: 'string' } }, required: ['userId', 'userType', 'amount'] } })
  @Post('fund-wallet')
  fundWallet(@Body() body: { userId: string; userType: string; amount: number; description: string }) {
    return this.paymentsService.fundUserWallet(body);
  }

  @ApiTags('6. Payments')
  @ApiOperation({ summary: 'Get list of supported banks from Paystack' })
  @Get('banks')
  getBanks() {
    return this.paymentsService.getBanks();
  }

  @ApiTags('6. Payments')
  @ApiOperation({ summary: 'Resolve/verify a bank account against Paystack' })
  @Get('resolve-account')
  resolveAccount(@Query('bankCode') bankCode: string, @Query('accountNumber') accountNumber: string) {
    if (!bankCode || !accountNumber) {
      throw new BadRequestException('bankCode and accountNumber are required');
    }
    return this.paymentsService.resolveAccount(bankCode, accountNumber);
  }
}
