import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TrackingGateway } from '../tracking/tracking.gateway';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('dispatch')
export class DispatchController {
  constructor(
    private readonly dispatchService: DispatchService,
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
  ) {}

  @Get('active')
  @ApiOperation({ summary: '[Admin] Get all active ride requests in the pool' })
  async getActivePool() {
    const requests = await this.prisma.activeRideRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Enriched with order details
    const enriched = await Promise.all(
      requests.map(async (req) => {
        const order = await this.prisma.order.findUnique({
          where: { id: req.orderId },
          include: { customer: true, rider: true },
        });
        return {
          ...req,
          order,
        };
      }),
    );

    return enriched;
  }

  @Get('debug/status')
  @ApiOperation({ summary: '[Admin] Diagnostic: check dispatch system health' })
  async debugStatus() {
    const totalRiders = await this.prisma.rider.count();
    const onlineRiders = await this.prisma.rider.findMany({
      where: { status: 'Online' },
      select: { id: true, name: true, status: true, latitude: true, longitude: true, rating: true, phone: true },
    });
    const activeRequests = await this.prisma.activeRideRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const recentOrders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, status: true, pickupLocation: true, pickupLat: true, pickupLng: true, createdAt: true },
    });
    
    // Socket info
    const connectedSockets = this.trackingGateway.server?.sockets?.sockets?.size ?? 0;

    return {
      timestamp: new Date().toISOString(),
      riders: {
        total: totalRiders,
        online: onlineRiders.length,
        onlineList: onlineRiders,
      },
      activeDispatchRequests: activeRequests,
      recentOrders,
      socket: {
        connectedClients: connectedSockets,
      },
    };
  }

  @Post('test/:orderId')
  @ApiOperation({ summary: '[Admin] Manually re-trigger dispatch for an order' })
  async testDispatch(@Param('orderId') orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return { error: 'Order not found' };
    }
    const result = await this.dispatchService.findOffersForRequest(orderId);
    return { orderId, dispatchResult: result };
  }

  @Post(':orderId/decline')
  @ApiOperation({ summary: '[Rider] Decline a ride offer' })
  async declineOffer(@Param('orderId') orderId: string, @Request() req: any) {
    const riderId = req.user.profileId || req.user.id;
    return this.dispatchService.declineOffer(orderId, riderId);
  }

  @Post(':orderId/accept')
  @ApiOperation({ summary: '[Rider] Accept a ride offer' })
  async acceptOffer(@Param('orderId') orderId: string, @Request() req: any) {
    const riderId = req.user.profileId || req.user.id;
    // This will transition the order to 'Accepted' and stop the dispatching pool
    return this.dispatchService.acceptOffer(orderId, riderId);
  }
}
