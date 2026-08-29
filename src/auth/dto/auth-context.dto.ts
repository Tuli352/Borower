import { IsEnum, IsString, IsNotEmpty, IsOptional, IsEmail, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum AppType {
  CUSTOMER = 'customer',
  RIDER = 'rider',
  VENDOR = 'vendor',
}

export enum AuthMethod {
  PHONE = 'phone',
  EMAIL = 'email',
}

export class AuthStartDto {
  @ApiProperty({ enum: AppType, example: 'customer' })
  @IsEnum(AppType)
  @IsNotEmpty()
  appType: AppType;

  @ApiProperty({ enum: AuthMethod, example: 'phone' })
  @IsEnum(AuthMethod)
  @IsNotEmpty()
  authMethod: AuthMethod;

  @ApiProperty({ required: false, example: '+2348011111111' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false, example: 'testcustomer@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ enum: AppType, example: 'customer', required: false })
  @IsEnum(AppType)
  @IsOptional()
  appType?: AppType;

  @ApiProperty({ example: '+2348011111111', required: false })
  @IsOptional()
  @IsString()
  destination?: string; // phone or email

  @ApiProperty({ example: '123456', required: false })
  @IsOptional()
  @IsString()
  otpCode?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  otp?: string;
}

export class GoogleAuthDto {
  @ApiProperty({ enum: AppType, example: 'customer' })
  @IsEnum(AppType)
  @IsNotEmpty()
  appType: AppType;

  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'google_id_token' })
  @IsString()
  @IsOptional()
  token?: string;
}

export class CheckPhoneDto {
  @ApiProperty({ example: '+2348011111111' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'rider', required: false })
  @IsOptional()
  @IsString()
  role?: string;
}
