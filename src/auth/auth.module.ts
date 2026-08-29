import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { LocalStrategy } from './local.strategy';
import { JwtStrategy } from './jwt.strategy';
import { CustomersModule } from '../customers/customers.module';
import { RidersModule } from '../riders/riders.module';
import { VendorsModule } from '../vendors/vendors.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SmsModule } from '../sms/sms.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { MailModule } from '../mail/mail.module';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { RedisModule } from '../redis/redis.module';
import { CustomerAuthService } from './services/customer-auth.service';
import { RiderAuthService } from './services/rider-auth.service';
import { VendorAuthService } from './services/vendor-auth.service';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    CustomersModule,
    RidersModule,
    VendorsModule,
    SmsModule,
    FirebaseModule,
    MailModule,
    RedisModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'jwt_secret_key_placeholder',
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService, 
    LocalStrategy, 
    JwtStrategy, 
    OptionalJwtAuthGuard,
    CustomerAuthService,
    RiderAuthService,
    VendorAuthService
  ],
  controllers: [AuthController],
  exports: [AuthService, CustomerAuthService, RiderAuthService, VendorAuthService],
})
export class AuthModule {}

