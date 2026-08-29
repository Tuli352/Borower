import { Controller, Post, UseGuards, Request, Get, Body, Patch, UnauthorizedException, BadRequestException, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { BypassTransform } from '../common/decorators/bypass-transform.decorator';
import { AuthStartDto, VerifyOtpDto, AuthMethod, GoogleAuthDto, CheckPhoneDto } from './dto/auth-context.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiTags('Auth / Shared')
  @ApiOperation({ summary: 'Initiate Authentication (OTP)' })
  @Post('start')
  async authStart(@Body() dto: AuthStartDto) {
    return this.authService.authStart(dto);
  }

  @ApiTags('Auth / Shared')
  @ApiOperation({ summary: 'Verify OTP & Finalize Login' })
  @BypassTransform()
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @ApiTags('Auth / Shared')
  @ApiOperation({ summary: 'Google Social Login' })
  @BypassTransform()
  @Post('google')
  async googleAuth(@Body() dto: GoogleAuthDto) {
    return this.authService.googleLogin(dto);
  }

  @ApiTags('Admin')
  @ApiOperation({ summary: '[Admin] Email/Password Login' })
  @ApiBody({ schema: { type: 'object', properties: { email: { type: 'string', example: 'admin@kogiride.com' }, password: { type: 'string', example: 'password123' } } } })
  @BypassTransform()
  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  @ApiTags('Auth / Shared')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current session profile' })
  @UseGuards(AuthGuard('jwt'))
  @BypassTransform()
  @Get('me')
  async getMe(@Request() req: any) {
    return this.authService.getMe(req.user);
  }

  // Legacy support or alias
  @ApiTags('Auth / Shared')
  @ApiOperation({ summary: 'Legacy OTP Request (Alias for start)' })
  @Post('send-otp')
  async sendOtp(@Body() body: { phone: string; role: string; email?: string }) {
    return this.authService.authStart({
        appType: body.role as any,
        authMethod: body.phone ? AuthMethod.PHONE : AuthMethod.EMAIL,
        phone: body.phone,
        email: body.email
    });
  }

  @ApiTags('Auth / Shared')
  @ApiOperation({ summary: 'Check if phone number already exists' })
  @Post('check-phone')
  async checkPhone(@Body() dto: CheckPhoneDto) {
    return this.authService.checkPhone(dto.phone, dto.role);
  }
}
