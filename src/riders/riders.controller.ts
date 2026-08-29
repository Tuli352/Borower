import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, UnauthorizedException, NotFoundException, BadRequestException, Query } from '@nestjs/common';
import { RidersService } from './riders.service';
import { DocumentsService } from './documents.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { AppContext } from '../auth/decorators/app-context.decorator';
import { AppType } from '../auth/dto/auth-context.dto';

@ApiBearerAuth()
@Controller('riders')
export class RidersController {
  constructor(
    private readonly ridersService: RidersService,
    private readonly documentsService: DocumentsService,
  ) {}

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Create a new rider' })
  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Body() data: { accountId?: string } & any) {
    const { accountId, ...rest } = data;
    return this.ridersService.create(rest, accountId);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Upload verification document' })
  @AppContext(AppType.RIDER)
  @Post('documents')
  async uploadDocument(@Request() req: any, @Body() data: { type: string; url: string; expiryDate?: Date }) {
    return this.documentsService.uploadDocument(req.user.profileId, data);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Get own documents' })
  @AppContext(AppType.RIDER)
  @Get('documents')
  async getMyDocuments(@Request() req: any) {
    return this.documentsService.getRiderDocuments(req.user.profileId);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Update document status' })
  @UseGuards(AuthGuard('jwt'))
  @Patch('documents/:docId/status')
  async updateDocumentStatus(
    @Param('docId') docId: string,
    @Body() body: { status: string; notes?: string },
  ) {
    return this.documentsService.updateDocumentStatus(docId, body.status, body.notes);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get rider documents' })
  @UseGuards(AuthGuard('jwt'))
  @Get(':id/documents')
  async getRiderDocumentsForAdmin(@Param('id') id: string) {
    return this.documentsService.getRiderDocuments(id);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get all riders' })
  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll() {
    return this.ridersService.findAll();
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Get own profile' })
  @AppContext(AppType.RIDER)
  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.ridersService.findOneProfileForApp(req.user.profileId);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Update own profile' })
  @AppContext(AppType.RIDER)
  @Patch('profile')
  async updateProfile(@Request() req: any, @Body() updateData: any) {
    return this.ridersService.update(req.user.profileId, updateData);
  }

  @ApiTags('Customer App')
  @ApiOperation({ summary: '[Customer] Get nearby drivers/riders' })
  @Get('nearby')
  async getNearbyRiders(@Query('lat') lat: string, @Query('lng') lng: string, @Query('radius') radius: string) {
    return this.ridersService.findNearby(Number(lat), Number(lng), Number(radius));
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Submit an incident report' })
  @AppContext(AppType.RIDER)
  @Post('reports')
  async submitReport(@Request() req: any, @Body() body: { category: string; description: string; orderId?: string }) {
    return this.ridersService.submitIncidentReport(req.user.profileId, body);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Wallet balance' })
  @AppContext(AppType.RIDER)
  @Get('wallet')
  async getWallet(@Request() req: any) {
    return this.ridersService.getWallet(req.user.profileId);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Wallet transactions' })
  @AppContext(AppType.RIDER)
  @Get('wallet/transactions')
  async getWalletTransactions(@Request() req: any, @Query('limit') limit: string, @Query('page') page: string) {
    return this.ridersService.getWalletTransactions(req.user.profileId, Number(limit || 50), Number(page || 1));
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Cash-out / payout request' })
  @AppContext(AppType.RIDER)
  @Post('wallet/payout-request')
  async requestPayout(@Request() req: any, @Body() body: any) {
    return this.ridersService.requestWalletPayout(req.user.profileId, body);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Get ratings/stats' })
  @AppContext(AppType.RIDER)
  @Get('stats')
  async stats(@Request() req: any) {
    return this.ridersService.buildRiderRatingMetrics(req.user.profileId);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Trip reviews' })
  @AppContext(AppType.RIDER)
  @Get('reviews')
  async reviews(@Request() req: any, @Query('limit') limit: string, @Query('page') page: string) {
    return this.ridersService.getRiderReviews(req.user.profileId, Number(limit || 20), Number(page || 1));
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Payout bank accounts' })
  @AppContext(AppType.RIDER)
  @Get('bank-accounts')
  async listBankAccounts(@Request() req: any) {
    return this.ridersService.listBankAccounts(req.user.profileId);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Add bank account' })
  @AppContext(AppType.RIDER)
  @Post('bank-accounts')
  async addBankAccount(@Request() req: any, @Body() body: any) {
    return this.ridersService.addBankAccount(req.user.profileId, body);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Update own GPS location' })
  @AppContext(AppType.RIDER)
  @Patch('location')
  updateLocation(@Request() req: any, @Body() location: { lat: number; lng: number; orderId?: string }) {
    return this.ridersService.updateLocation(req.user.profileId, location.lat, location.lng, location.orderId);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Update online/offline status' })
  @AppContext(AppType.RIDER)
  @Patch('status')
  updateStatus(@Request() req: any, @Body() body: { status: string }) {
    return this.ridersService.updateStatus(req.user.profileId, body.status);
  }

  @ApiTags('Rider App')
  @ApiOperation({ summary: '[Rider] Get own trips' })
  @AppContext(AppType.RIDER)
  @Get('trips')
  getTrips(@Request() req: any) {
    return this.ridersService.getRiderTrips(req.user.profileId);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Get rider by ID' })
  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.ridersService.findOne(id);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Update rider by ID' })
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateData: any) {
    return this.ridersService.update(id, updateData);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Delete rider by ID' })
  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ridersService.delete(id);
  }
}
