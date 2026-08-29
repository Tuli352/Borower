import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards, Request } from '@nestjs/common';
import { DisputeService } from './dispute.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';

@ApiTags('Dispute Resolution')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('disputes')
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @ApiOperation({ summary: '[Customer/Rider/Vendor] Create a new dispute' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['orderId', 'category', 'description'],
      properties: {
        orderId: { type: 'string', example: 'uuid-order-123' },
        category: { type: 'string', example: 'Service Quality' },
        description: { type: 'string', example: 'The rider was very rude and unprofessional during the trip.' },
        evidence: {
          type: 'object',
          properties: {
            images: { type: 'array', items: { type: 'string' } },
            videos: { type: 'array', items: { type: 'string' } },
            audio: { type: 'array', items: { type: 'string' } },
            documents: { type: 'array', items: { type: 'string' } }
          }
        },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' }
      }
    }
  })
  @Post()
  async createDispute(@Body() body: any, @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    
    // Determine complainant type
    let complainantType: 'customer' | 'rider' | 'vendor';
    if (userRole === 'customer') complainantType = 'customer';
    else if (userRole.includes('rider') || userRole.includes('driver')) complainantType = 'rider';
    else if (userRole === 'vendor') complainantType = 'vendor';
    else throw new Error('Invalid user role for dispute creation');

    // Get order to determine respondent
    const order = await this.disputeService['prisma'].order.findUnique({
      where: { id: body.orderId },
      include: { customer: true, rider: true }
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Determine respondent
    let respondentId: string;
    let respondentType: 'customer' | 'rider' | 'vendor' | 'admin';

    if (complainantType === 'customer') {
      respondentId = order.riderId || '';
      respondentType = 'rider';
    } else if (complainantType === 'rider') {
      respondentId = order.customerId;
      respondentType = 'customer';
    } else {
      respondentId = 'admin';
      respondentType = 'admin';
    }

    return this.disputeService.createDispute({
      ...body,
      complainantId: req.user.id,
      complainantType,
      respondentId,
      respondentType
    });
  }

  @ApiOperation({ summary: '[Customer/Rider/Vendor] Add response to dispute' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string', example: 'I would like to clarify my side of the story...' },
        evidence: {
          type: 'object',
          properties: {
            images: { type: 'array', items: { type: 'string' } },
            videos: { type: 'array', items: { type: 'string' } },
            audio: { type: 'array', items: { type: 'string' } },
            documents: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  })
  @Post(':id/respond')
  async addResponse(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.disputeService.addResponse(id, req.user.id, body);
  }

  @ApiOperation({ summary: '[Customer/Rider/Vendor/Admin] Get dispute details' })
  @ApiParam({ name: 'id', type: 'string' })
  @Get(':id')
  async getDispute(@Param('id') id: string, @Request() req: any) {
    return this.disputeService.getDispute(id, req.user.id, req.user.role);
  }

  @ApiOperation({ summary: '[Customer/Rider/Vendor] Get my disputes' })
  @Get('my-disputes')
  async getMyDisputes(@Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    
    let userType: 'customer' | 'rider' | 'vendor';
    if (userRole === 'customer') userType = 'customer';
    else if (userRole.includes('rider') || userRole.includes('driver')) userType = 'rider';
    else if (userRole === 'vendor') userType = 'vendor';
    else throw new Error('Invalid user role');

    return this.disputeService.getUserDisputes(req.user.id, userType);
  }

  @ApiOperation({ summary: '[Admin] Update dispute status' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['Open', 'Under Review', 'Investigating', 'Resolved', 'Dismissed'] },
        resolution: { type: 'string', example: 'Refund processed to customer wallet' }
      }
    }
  })
  @Patch(':id/status')
  async updateDisputeStatus(
    @Param('id') id: string,
    @Body() body: { status: string; resolution?: string },
    @Request() req: any
  ) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    return this.disputeService.updateDisputeStatus(id, body.status, body.resolution);
  }

  @ApiOperation({ summary: '[Admin] Get all disputes' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @Get()
  async getAllDisputes(
    @Query() query: any,
    @Request() req: any
  ) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    return this.disputeService.getAllDisputes(query);
  }

  @ApiOperation({ summary: '[Admin] Get dispute statistics' })
  @Get('statistics')
  async getDisputeStatistics(@Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    return this.disputeService.getDisputeStatistics();
  }
}
