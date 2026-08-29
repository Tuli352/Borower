import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { Injectable, Inject, forwardRef, NotFoundException, BadRequestException } from '@nestjs/common';

@Injectable()
export class RidersService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => TrackingGateway))
    private trackingGateway: TrackingGateway,
  ) {}

  findAll() {
    return this.prisma.rider.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findAllOnline() {
    return this.prisma.rider.findMany({
      where: {
        status: 'Online',
        latitude: { not: null },
        longitude: { not: null },
      },
    });
  }

  findOne(id: string) {
    return this.prisma.rider.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: 'desc' } },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  private generateReferralCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  async create(data: any, accountId?: string) {
    const { referralCode: codeUsed, carColor, drivingLicence, phone, email, vehicleDetails, vehicle, vehicleType, ...rest } = data;
    
    // 1. Resolve or Create Account if not provided
    let effectiveAccountId = accountId;
    if (!effectiveAccountId) {
      if (!phone && !email) {
        throw new Error('Either accountId, phone, or email must be provided to create a rider profile');
      }

      let account = await this.prisma.account.findFirst({
        where: {
          OR: [
            ...(phone ? [{ phone }] : []),
            ...(email ? [{ email }] : []),
          ],
        },
      });

      if (!account) {
        account = await this.prisma.account.create({
          data: {
            phone,
            email,
            hasRiderProfile: true,
            isVerified: true, // Admin-created accounts are verified by default
          },
        });
      } else {
        await this.prisma.account.update({
          where: { id: account.id },
          data: { hasRiderProfile: true },
        });
      }
      effectiveAccountId = account.id;
    }

    // Check if rider with this phone already exists
    const existingRider = await this.prisma.rider.findFirst({ where: { phone: phone || undefined } });
    if (existingRider) {
      throw new Error(`Rider with phone number ${phone} already exists`);
    }
    
    // 2. Generate unique code for the new user
    let newCode = this.generateReferralCode();
    
    // 3. Handle referrer if provided
    let referredById = null;
    if (codeUsed) {
      const referrer = await this.prisma.rider.findFirst({ where: { referralCode: codeUsed } });
      if (referrer) {
        referredById = referrer.id;
      }
    }

    // Handle vehicleDetails object if provided
    let vehicleData = {};
    if (vehicleDetails) {
      vehicleData = {
        vehicle: `${vehicleDetails.make} ${vehicleDetails.model} ${vehicleDetails.year}`,
        vehicleType: `${vehicleDetails.make} ${vehicleDetails.model}`,
      };
    } else {
      // Fallback to individual fields
      vehicleData = {
        vehicle: vehicle || '',
        vehicleType: vehicleType || '',
      };
    }

    return this.prisma.rider.create({
      data: {
        ...rest,
        account: { connect: { id: effectiveAccountId } },
        phone,
        email,
        vehicleColor: carColor, // Map carColor to vehicleColor
        referralCode: newCode,
        referredBy: referredById ? { connect: { id: referredById } } : undefined,
        ...vehicleData
      }
    });
  }

  async updateLocation(id: string, latitude: number, longitude: number, orderId?: string) {
    const updatedRider = await this.prisma.rider.update({
      where: { id },
      data: { 
        latitude, 
        longitude,
        updatedAt: new Date()
      },
    });
    
    // Broadcast the update to all connected web clients globally
    this.trackingGateway.broadcastLocation(id, latitude, longitude);
    
    if (orderId) {
      // Direct live location specifically to the tracking room for this active order
      this.trackingGateway.broadcastOrderLocation(orderId, latitude, longitude, id);
    }
    
    return updatedRider;
  }

  async update(id: string, data: any) {
    const normalizedData = { ...data };

    // Frontend may send nested vehicleDetails while Prisma expects flat Rider fields.
    if (normalizedData.vehicleDetails && typeof normalizedData.vehicleDetails === 'object') {
      const details = normalizedData.vehicleDetails;
      const modelOrMake = details.model ?? details.make;

      if (modelOrMake) {
        normalizedData.vehicle = modelOrMake;
      }

      if (details.plateNumber ?? details.plate) {
        normalizedData.plateNumber = details.plateNumber ?? details.plate;
      }

      if (details.color ?? details.carColor) {
        normalizedData.vehicleColor = details.color ?? details.carColor;
      }

      delete normalizedData.vehicleDetails;
    }

    if (normalizedData.carColor) {
      normalizedData.vehicleColor = normalizedData.carColor;
      delete normalizedData.carColor;
    }

    // Strict allowed fields whitelist for Prisma update operation
    const allowedKeys = [
      'name',
      'email',
      'phone',
      'status',
      'onboardingStep',
      'vehicle',
      'plateNumber',
      'vehicleType',
      'vehicleColor',
      'latitude',
      'longitude',
      'isOnline',
      'rating',
      'rides',
      'earnings',
      'walletBalance',
      'bankName',
      'bankAccount',
      'bankCode',
      'accountName',
      'ridePreferences',
      'totalLoyaltyPoints',
      'avatar',
      'referralCode',
      'plusMember',
      'plusExpiry',
      'streak',
      'lastTripAt'
    ];

    const prismaUpdateData: Record<string, any> = {};
    for (const key of allowedKeys) {
      if (normalizedData[key] !== undefined) {
        prismaUpdateData[key] = normalizedData[key];
      }
    }

    try {
      if (prismaUpdateData.phone) {
        const riderObj = await this.prisma.rider.findUnique({
          where: { id },
          select: { accountId: true },
        });
        if (riderObj) {
          const existingAccount = await this.prisma.account.findUnique({
            where: { phone: prismaUpdateData.phone },
          });
          if (existingAccount && existingAccount.id !== riderObj.accountId) {
            throw new BadRequestException('Phone number is already in use by another account');
          }
          await this.prisma.account.update({
            where: { id: riderObj.accountId },
            data: { phone: prismaUpdateData.phone },
          });
        }
      }

      return await this.prisma.rider.update({
        where: { id },
        data: prismaUpdateData,
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error.code === 'P2025' || error.name === 'PrismaClientKnownRequestError') {
        throw new NotFoundException(`Rider with ID "${id}" not found.`);
      }
      throw new BadRequestException(`Failed to update rider: ${error.message}`);
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async findNearby(lat: number, lng: number, radius: number) {
    const onlineRiders = await this.findAllOnline();
    const radiusNum = Number(radius) || 5; // default 5km

    const nearbyRiders = onlineRiders.filter(rider => {
      if (rider.latitude && rider.longitude) {
        const dist = this.calculateDistance(lat, lng, rider.latitude, rider.longitude);
        return dist <= radiusNum;
      }
      return false;
    });

    return nearbyRiders.map(r => ({
      id: r.id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      vehicleDetails: { make: r.vehicle, model: r.vehicle, plateNumber: r.plateNumber },
    }));
  }

  async updateStatus(id: string, status: string) {
    try {
      return await this.prisma.rider.update({
        where: { id },
        data: { status },
      });
    } catch (error) {
       throw new BadRequestException(`Failed to update status: ${error.message}`);
    }
  }

  async delete(id: string) {
    try {
      return await this.prisma.rider.delete({ where: { id } });
    } catch (error) {
      throw new NotFoundException(`Rider with ID "${id}" not found.`);
    }
  }

  /** Metrics for /rating-summary, /stats, profile, /auth/me */
  async buildRiderRatingMetrics(riderId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { id: riderId },
      select: { rating: true },
    });
    if (!rider) return null;

    const ratedOrders = await this.prisma.order.findMany({
      where: { riderId, rating: { not: null } },
      select: { rating: true },
    });

    const avgFromOrders =
      ratedOrders.length > 0
        ? ratedOrders.reduce((a, o) => a + (o.rating ?? 0), 0) / ratedOrders.length
        : null;

    const averageRating = avgFromOrders ?? rider.rating ?? 0;
    const totalRatings = ratedOrders.length;

    const assignedCount = await this.prisma.order.count({ where: { riderId } });
    const completedCount = await this.prisma.order.count({ where: { riderId, status: 'Completed' } });
    const cancelledCount = await this.prisma.order.count({ where: { riderId, status: 'Cancelled' } });

    const acceptanceRate = assignedCount > 0 ? completedCount / assignedCount : 0;
    const cancellationRate = assignedCount > 0 ? cancelledCount / assignedCount : 0;

    return {
      averageRating: Math.round(averageRating * 100) / 100,
      totalRatings,
      ratedTripCount: totalRatings,
      acceptanceRate,
      cancellationRate,
      acceptanceRatePercent: Math.round(acceptanceRate * 100),
      cancellationRatePercent: Math.round(cancellationRate * 100),
      totalRides: assignedCount,
    };
  }

  mapWalletTransaction(t: {
    id: string;
    reference: string;
    type: string;
    amount: number;
    status: string;
    method: string;
    description: string | null;
    payoutStatus: string | null;
    orderId: string | null;
    date: Date;
    createdAt: Date;
  }) {
    const desc = (t.description || '').toLowerCase();
    const method = (t.method || '').toLowerCase();
    const isAdminCredit =
      method.includes('manual admin') ||
      desc.includes('admin manual') ||
      (t.type === 'Credit' && desc.includes('admin'));
    const label = isAdminCredit ? 'Admin wallet credit' : t.description || t.type;
    return {
      id: t.id,
      reference: t.reference,
      amount: t.amount,
      type: t.type,
      status: t.status,
      method: t.method,
      description: t.description,
      source: isAdminCredit ? 'admin' : t.type === 'Credit' ? 'credit' : 'debit',
      label,
      payoutStatus: t.payoutStatus,
      orderId: t.orderId,
      date: t.date,
      createdAt: t.createdAt,
    };
  }

  async getWallet(riderId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { id: riderId },
      select: { id: true, walletBalance: true, name: true },
    });
    if (!rider) throw new NotFoundException(`Rider with ID ${riderId} not found`);
    return {
      riderId: rider.id,
      balance: rider.walletBalance,
      currency: 'NGN',
      name: rider.name,
    };
  }

  async getWalletTransactions(riderId: string, limit = 50, page = 1) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const p = Math.max(Number(page) || 1, 1);
    const skip = (p - 1) * take;

    const rider = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { id: true } });
    if (!rider) throw new NotFoundException(`Rider with ID ${riderId} not found`);

    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { riderId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.transaction.count({ where: { riderId } }),
    ]);

    return {
      data: rows.map((t) => this.mapWalletTransaction(t)),
      total,
      page: p,
      limit: take,
    };
  }

  async requestWalletPayout(
    riderId: string,
    body: {
      amount: number;
      bankName: string;
      accountNumber: string;
      accountName: string;
      currency?: string;
    },
  ) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }
    if (!body.bankName?.trim() || !body.accountNumber?.trim() || !body.accountName?.trim()) {
      throw new BadRequestException('bankName, accountNumber, and accountName are required');
    }

    const currency = (body.currency || 'NGN').toUpperCase();

    const rider = await this.prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw new NotFoundException(`Rider with ID ${riderId} not found`);
    if (rider.walletBalance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rider.update({
        where: { id: riderId },
        data: { walletBalance: { decrement: amount } },
      });
      await tx.transaction.create({
        data: {
          reference: `PAYOUT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          riderId,
          type: 'Debit',
          amount,
          status: 'Pending',
          method: 'Bank Payout',
          description: `Cash-out request (${currency}) to ${body.bankName} · ${body.accountNumber} · ${body.accountName}`,
          user: `Rider:${rider.name || riderId}`,
          date: new Date(),
        },
      });
    });

    return {
      success: true,
      message: 'Payout request recorded. Funds are pending settlement.',
      currency,
    };
  }

  /** Placeholder for in-app card top-up; client should use Paystack then verify reference. */
  async fundWalletFromCard(
    riderId: string,
    body: { amount: number; reference?: string; currency?: string },
  ) {
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { id: true } });
    if (!rider) throw new NotFoundException(`Rider with ID ${riderId} not found`);

    if (body.reference?.trim()) {
      return {
        success: false,
        message:
          'To complete card funding, verify the Paystack reference via POST /api/payments/verify with { "reference": "..." } after payment. Wallet updates when verification succeeds.',
      };
    }

    return {
      success: false,
      message:
        'Initialize payment with Paystack on the client, then call POST /api/payments/verify with the transaction reference to credit this wallet.',
    };
  }

  async getRiderReviews(riderId: string, limit = 20, page = 1) {
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const p = Math.max(Number(page) || 1, 1);
    const skip = (p - 1) * take;

    const where = {
      riderId,
      OR: [{ rating: { not: null } }, { feedback: { not: null } }],
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          rating: true,
          feedback: true,
          createdAt: true,
          status: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders.map((o) => ({
        orderId: o.id,
        comment: o.feedback ?? '',
        rating: o.rating,
        createdAt: o.createdAt,
        status: o.status,
      })),
      total,
      page: p,
      limit: take,
    };
  }

  async listBankAccounts(riderId: string) {
    return this.prisma.riderBankAccount.findMany({
      where: { riderId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async addBankAccount(
    riderId: string,
    body: {
      bankName: string;
      accountNumber: string;
      accountName: string;
      currency?: string;
      isDefault?: boolean;
    },
  ) {
    if (!body.bankName?.trim() || !body.accountNumber?.trim() || !body.accountName?.trim()) {
      throw new BadRequestException('bankName, accountNumber, and accountName are required');
    }

    if (body.isDefault) {
      await this.prisma.riderBankAccount.updateMany({
        where: { riderId },
        data: { isDefault: false },
      });
    }

    return this.prisma.riderBankAccount.create({
      data: {
        riderId,
        bankName: body.bankName.trim(),
        accountNumber: body.accountNumber.trim(),
        accountName: body.accountName.trim(),
        currency: (body.currency || 'NGN').toUpperCase(),
        isDefault: !!body.isDefault,
      },
    });
  }

  /** Profile payload with rating fields for home / tiles */
  async findOneProfileForApp(id: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: 'desc' } },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!rider) return null;

    const metrics = await this.buildRiderRatingMetrics(id);
    if (!metrics) return rider;

    return {
      ...rider,
      averageRating: metrics.averageRating,
      driverRating: metrics.averageRating,
      totalRatings: metrics.totalRatings,
      acceptanceRate: metrics.acceptanceRate,
      cancellationRate: metrics.cancellationRate,
      acceptanceRatePercent: metrics.acceptanceRatePercent,
      cancellationRatePercent: metrics.cancellationRatePercent,
      ratedTripCount: metrics.ratedTripCount,
    };
  }

  async getRiderTrips(riderId: string) {
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw new NotFoundException(`Rider with ID ${riderId} not found`);

    // 1. Get standard trips assigned to this rider
    const trips = await this.prisma.order.findMany({
      where: { riderId },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true, phone: true } },
      }
    });

    // 2. Get active ride requests they haven't declined
    const activeRequests = await this.prisma.activeRideRequest.findMany({
      where: {
        status: { in: ['SEARCHING', 'OFFERED'] },
        OR: [
          { currentRiderId: riderId },
          { currentRiderId: null }
        ]
      },
    });

    const eligibleOrderIds = activeRequests
      .filter(req => {
        try {
          const declinedIds = JSON.parse(req.declinedRiders || '[]');
          return !declinedIds.includes(riderId);
        } catch {
          return true;
        }
      })
      .map(req => req.orderId);

    const pendingOrders = await this.prisma.order.findMany({
      where: { id: { in: eligibleOrderIds } },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true, phone: true } },
      }
    });

    // Combine and sort
    const allOrdersMap = new Map();
    trips.forEach(t => allOrdersMap.set(t.id, t));
    pendingOrders.forEach(t => allOrdersMap.set(t.id, t));
    
    const combined = Array.from(allOrdersMap.values());
    combined.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());

    return combined;
  }

  async submitIncidentReport(riderId: string, data: { category: string; description: string; orderId?: string }) {
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw new NotFoundException(`Rider with ID ${riderId} not found`);

    return this.prisma.ticket.create({
      data: {
        userId: riderId,
        userRole: 'RIDER',
        userEmail: rider.email,
        userPhone: rider.phone,
        user: rider.name,
        type: data.category,
        subject: `Incident Report: ${data.category}`,
        description: data.description,
        status: 'Open',
        priority: 'High',
      },
    });
  }
}
