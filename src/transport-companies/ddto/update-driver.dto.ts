import { IsOptional, IsString, IsEnum, IsEmail } from 'class-validator';

export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  driversLicenseNumber?: string;

  @IsOptional()
  @IsEnum(['Motorcycle', 'Tricycle', 'Car'])
  vehicleType?: string;

  @IsOptional()
  @IsString()
  vehiclePlateNumber?: string;
}
