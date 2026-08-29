import { Injectable, UnauthorizedException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { AuthStartDto, VerifyOtpDto, AppType, AuthMethod, GoogleAuthDto } from './dto/auth-context.dto';
import { CustomerAuthService } from './services/customer-auth.service';
import { RiderAuthService } from './services/rider-auth.service';
import { VendorAuthService } from './services/vendor-auth.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private smsService: SmsService,
    private mailService: MailService,
    private redisService: RedisService,
    private customerAuth: CustomerAuthService,
    private riderAuth: RiderAuthService,
    private vendorAuth: VendorAuthService,
  ) {}

  async authStart(dto: AuthStartDto) {
    const { appType, authMethod, phone, email } = dto;
    const destination = authMethod === AuthMethod.PHONE ? phone : email;

    if (!destination) {
      throw new BadRequestException(`${authMethod} is required`);
    }

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store in Redis (10 minutes expiry)
    await this.redisService.storeOTP(appType, destination, otp);

    // Delivery
    let deliveryStatus = { sms: false, email: false };

    if (authMethod === AuthMethod.PHONE) {
      if (!phone) throw new BadRequestException('Phone is required for SMS delivery');
      deliveryStatus.sms = await this.smsService.sendOTP(phone, otp);
    } else {
      if (!email) throw new BadRequestException('Email is required for email delivery');
      const { previewUrl } = await this.mailService.sendOtpEmail(email, otp, 'Email Login');
      deliveryStatus.email = true;
      this.logger.log(`OTP Email sent to ${email}. Preview: ${previewUrl}`);
    }

    // Dev bypass check
    const isBypass = process.env.OTP_ALLOW_DEV_BYPASS === 'true';
    if (isBypass) {
        this.logger.log(`[DEV BYPASS] OTP for ${destination} is ${otp}`);
    }

    return {
      message: 'OTP initiated',
      appType,
      authMethod,
      destination,
      deliveryStatus,
      ...(isBypass ? { devOtp: otp } : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const appType = dto.appType || (dto.role as AppType);
    const destination = dto.destination || dto.phone || dto.email;
    const otpCode = dto.otpCode || dto.otp;

    if (!appType) {
      throw new BadRequestException('appType (role) should not be empty');
    }
    if (!destination) {
      throw new BadRequestException('destination (phone or email) should not be empty');
    }
    if (!otpCode) {
      throw new BadRequestException('otpCode (otp) should not be empty');
    }

    // 1. Verify OTP from Redis
    const isValid = await this.redisService.verifyOTP(appType, destination, otpCode);
    
    // Dev bypass check
    const isBypass = process.env.OTP_ALLOW_DEV_BYPASS === 'true' && otpCode === process.env.OTP_BYPASS_CODE;
    
    if (!isValid && !isBypass) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // 2. Find or Create Account
    const isEmail = destination.includes('@');
    const query = isEmail ? { email: destination } : { phone: destination };
    
    let account = await this.prisma.account.findUnique({
      where: query,
    });

    if (!account) {
      account = await this.prisma.account.create({
        data: {
          ...query,
          isVerified: true,
          status: 'ACTIVE',
        },
      });
    }

    // 3. App-Aware Boundary Protection & Profile Orchestration
    let profile: any;
    let onboardingStatus: any;

    if (appType === AppType.CUSTOMER) {
      profile = await this.customerAuth.findOrCreateProfile(account.id, {
        email: isEmail ? destination : undefined,
        phone: !isEmail ? destination : undefined,
      });
      onboardingStatus = await this.customerAuth.getOnboardingStatus(account.id);
    } else if (appType === AppType.RIDER) {
      profile = await this.riderAuth.findOrCreateProfile(account.id, {
        email: isEmail ? destination : undefined,
        phone: !isEmail ? destination : undefined,
      });
      onboardingStatus = await this.riderAuth.getOnboardingStatus(account.id);
    } else if (appType === AppType.VENDOR) {
      profile = await this.vendorAuth.findOrCreateProfile(account.id, {
        email: isEmail ? destination : undefined,
        phone: !isEmail ? destination : undefined,
      });
      onboardingStatus = await this.vendorAuth.getOnboardingStatus(account.id);
    }

    // 4. Issue Tokens
    const payload = { 
      sub: account.id, 
      email: account.email, 
      phone: account.phone, 
      appType,
      profileId: profile.id 
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      appType,
      user: {
        id: account.id,
        profileId: profile.id,
        email: profile.email || account.email,
        phone: profile.phone || account.phone,
        name: profile.name || profile.companyName,
      },
      onboarding: onboardingStatus,
    };
  }

  async googleLogin(dto: GoogleAuthDto) {
    const { email, name, appType } = dto;

    // 1. Find or Create Account
    let account = await this.prisma.account.findUnique({
      where: { email },
    });

    if (!account) {
      account = await this.prisma.account.create({
        data: {
          email,
          isVerified: true, // Google accounts are verified
          status: 'ACTIVE',
        },
      });
    }

    // 2. Find or Create Profile
    let profile: any;
    let onboardingStatus: any;

    if (appType === AppType.CUSTOMER) {
      profile = await this.customerAuth.findOrCreateProfile(account.id, { email, name });
      onboardingStatus = await this.customerAuth.getOnboardingStatus(account.id);
    } else if (appType === AppType.RIDER) {
      profile = await this.riderAuth.findOrCreateProfile(account.id, { email, name });
      onboardingStatus = await this.riderAuth.getOnboardingStatus(account.id);
    } else if (appType === AppType.VENDOR) {
      profile = await this.vendorAuth.findOrCreateProfile(account.id, { email, name });
      onboardingStatus = await this.vendorAuth.getOnboardingStatus(account.id);
    }

    // 3. Issue Tokens
    const payload = { 
      sub: account.id, 
      email: account.email, 
      appType,
      profileId: profile.id 
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      appType,
      user: {
        id: account.id,
        profileId: profile.id,
        email: profile.email || account.email,
        name: profile.name || profile.companyName,
      },
      onboarding: onboardingStatus,
    };
  }

  // Admin login remains legacy or separate
  async login(user: any) {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role || 'Admin',
      appType: user.loginType === 'company_admin' ? 'company_admin' : 'admin',
      companyId: user.companyId || null,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'Admin',
        loginType: user.loginType || 'admin',
        companyId: user.companyId || null,
        companyName: user.companyName || null,
      },
    };
  }

  async validateUser(email: string, pass: string): Promise<any> {
    // Check super admin first
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    if (admin && await bcrypt.compare(pass, admin.password)) {
      const { password, ...result } = admin;
      return { ...result, loginType: 'admin' };
    }

    // Then check company admin
    const companyAdmin = await this.prisma.companyAdmin.findUnique({
      where: { email },
      include: { transportCompany: true },
    });
    if (companyAdmin && companyAdmin.password === pass) {
      // Note: In production hash company admin passwords too
      const { password, ...result } = companyAdmin;
      return { ...result, loginType: 'company_admin', companyId: companyAdmin.transportCompanyId, companyName: companyAdmin.transportCompany?.name };
    }
    // Also try bcrypt for hashed passwords
    if (companyAdmin && await bcrypt.compare(pass, companyAdmin.password).catch(() => false)) {
      const { password, ...result } = companyAdmin;
      return { ...result, loginType: 'company_admin', companyId: companyAdmin.transportCompanyId, companyName: companyAdmin.transportCompany?.name };
    }

    return null;
  }

  async getMe(user: any) {
    const { id, appType } = user;
    
    if (appType === 'admin') {
        return this.prisma.adminUser.findUnique({ where: { id } });
    }

    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        customer: true,
        rider: true,
        vendor: true,
      }
    });

    if (!account) throw new UnauthorizedException();

    let profile = null;
    if (appType === AppType.CUSTOMER) profile = account.customer;
    if (appType === AppType.RIDER) profile = account.rider;
    if (appType === AppType.VENDOR) profile = account.vendor;

    return {
      ...account,
      profile,
      appType,
    };
  }

  async checkPhone(phone: string, role?: string) {
    if (!phone) {
      throw new BadRequestException('Phone number is required');
    }

    const account = await this.prisma.account.findUnique({
      where: { phone },
      include: {
        customer: true,
        rider: true,
        vendor: true,
      },
    });

    if (!account) {
      return { exists: false, message: 'Phone number not registered' };
    }

    let hasProfile = false;
    let name = '';

    if (role === 'rider') {
      hasProfile = !!account.rider;
      name = account.rider?.name || '';
    } else if (role === 'customer') {
      hasProfile = !!account.customer;
      name = account.customer?.name || '';
    } else if (role === 'vendor') {
      hasProfile = !!account.vendor;
      name = account.vendor?.companyName || '';
    } else {
      hasProfile = !!(account.customer || account.rider || account.vendor);
      name = (account.customer?.name || account.rider?.name || account.vendor?.companyName) || '';
    }

    return {
      exists: true,
      hasProfile,
      name,
      message: 'Phone number is registered',
    };
  }
}
