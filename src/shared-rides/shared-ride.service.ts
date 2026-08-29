import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Injectable()
export class SharedRideService {
  private readonly logger = new Logger(SharedRideService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trackingGateway: TrackingGateway,
  ) {}

  /**
   * Create a new shared ride pool for a driver.
   * The driver defines a route and available seats.
   */
  async createPool(driverId: string, data: { totalSeats: number; routeData: any }) {
    const rider = await this.prisma.rider.findUnique({ where: { id: driverId } });
    if (!rider) throw new NotFoundException('Rider not found');

    // Check no existing active pool
    const existingPool = await this.prisma.rideSharePool.findFirst({
      where: { driverId, status: 'ACTIVE' },
    });
    if (existingPool) throw new BadRequestException('You already have an active ride pool.');

    const pool = await this.prisma.rideSharePool.create({
      data: {
        driverId,
        totalSeats: data.totalSeats,
        availableSeats: data.totalSeats,
        routeData: JSON.stringify(data.routeData),
        status: 'ACTIVE',
      },
    });

    this.logger.log(`🚗 Shared pool ${pool.id} created by driver ${driverId} with ${data.totalSeats} seats`);
    return pool;
  }

  /**
   * Book seats in an existing shared ride pool.
   */
  async bookSharedRide(
    poolId: string,
    customerId: string,
    data: {
      seats: number;
      pickupLocation: string;
      dropoffLocation: string;
      pickupLat: number;
      pickupLng: number;
      dropoffLat: number;
      dropoffLng: number;
      amount: number;
    },
  ) {
    const pool = await this.prisma.rideSharePool.findUnique({ where: { id: poolId } });
    if (!pool || pool.status !== 'ACTIVE') throw new NotFoundException('Pool not found or inactive');

    if (data.seats > pool.availableSeats) {
      throw new BadRequestException(
        `Only ${pool.availableSeats} seat(s) available but ${data.seats} requested.`,
      );
    }

    // Create the shared ride order
    const order = await this.prisma.order.create({
      data: {
        customerId,
        riderId: pool.driverId,
        pickupLocation: data.pickupLocation,
        dropoffLocation: data.dropoffLocation,
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        dropoffLat: data.dropoffLat,
        dropoffLng: data.dropoffLng,
        amount: data.amount,
        seats: data.seats,
        isShared: true,
        status: 'Accepted',
        type: 'SharedRide',
        commission: data.amount * 0.15,
      },
      include: { customer: true },
    });

    // Decrement available seats
    await this.prisma.rideSharePool.update({
      where: { id: poolId },
      data: { availableSeats: { decrement: data.seats } },
    });

    // Notify driver
    this.trackingGateway.server.emit(`ride_offer_${pool.driverId}`, {
      type: 'SHARED_RIDE_BOOKING',
      orderId: order.id,
      customerName: order.customer.name,
      seats: data.seats,
      pickup: data.pickupLocation,
      dropoff: data.dropoffLocation,
    });

    this.logger.log(`🎫 ${data.seats} seat(s) booked in pool ${poolId} by customer ${customerId}`);
    return order;
  }

  /**
   * Find available ride pools along a route (simplified: within distance of pickup).
   */
  async findAvailablePools(pickupLat: number, pickupLng: number, seats: number = 1) {
    const pools = await this.prisma.rideSharePool.findMany({
      where: {
        status: 'ACTIVE',
        availableSeats: { gte: seats },
      },
      include: { driver: true },
    });

    // Filter pools whose driver is within 5km of the requested pickup
    return pools
      .filter((pool: any) => {
        if (!pool.driver.latitude || !pool.driver.longitude) return false;
        const dist = this.calculateDistance(
          pickupLat, pickupLng,
          pool.driver.latitude, pool.driver.longitude,
        );
        return dist <= 5;
      })
      .map((pool: any) => ({
        id: pool.id,
        driverName: pool.driver.name,
        driverRating: pool.driver.rating,
        vehicle: pool.driver.vehicle,
        vehicleColor: pool.driver.vehicleColor,
        plateNumber: pool.driver.plateNumber,
        totalSeats: pool.totalSeats,
        availableSeats: pool.availableSeats,
        routeData: JSON.parse(pool.routeData),
      }));
  }

  /**
   * Admin: Get all shared ride pools in the system
   */
  async getAllPools() {
    const pools = await this.prisma.rideSharePool.findMany({
      include: { driver: true },
      orderBy: { createdAt: 'desc' },
    });

    return pools.map((pool: any) => ({
      id: pool.id,
      driverName: pool.driver?.name || 'Unknown',
      driverRating: pool.driver?.rating || 0,
      vehicle: pool.driver?.vehicle || 'Unknown',
      plateNumber: pool.driver?.plateNumber || 'Unknown',
      totalSeats: pool.totalSeats,
      availableSeats: pool.availableSeats,
      status: pool.status,
      routeData: pool.routeData ? JSON.parse(pool.routeData) : {},
      createdAt: pool.createdAt,
    }));
  }

  /**
   * Close a pool (driver completes the route).
   */
  async closePool(poolId: string, driverId: string) {
    const pool = await this.prisma.rideSharePool.findUnique({ where: { id: poolId } });
    if (!pool) throw new NotFoundException('Pool not found');
    if (pool.driverId !== driverId) throw new BadRequestException('Unauthorized');

    return this.prisma.rideSharePool.update({
      where: { id: poolId },
      data: { status: 'COMPLETED' },
    });
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
