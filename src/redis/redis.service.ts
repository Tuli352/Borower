import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.error('REDIS_URL is not defined in environment variables');
      return;
    }

    this.redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.redisClient.on('connect', () => {
      this.logger.log('Connected to Redis successfully');
    });

    this.redisClient.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  onModuleDestroy() {
    this.redisClient.disconnect();
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redisClient.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redisClient.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.redisClient.get(key);
  }

  async del(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  // OTP specific methods
  async storeOTP(appType: string, destination: string, otp: string, ttlSeconds: number = 600): Promise<void> {
    const key = `otp:${appType}:${destination}`;
    await this.set(key, otp, ttlSeconds);
  }

  async verifyOTP(appType: string, destination: string, otp: string): Promise<boolean> {
    const key = `otp:${appType}:${destination}`;
    const storedOtp = await this.get(key);
    if (storedOtp === otp) {
      await this.del(key); // Clear OTP after successful verification
      return true;
    }
    return false;
  }
}
