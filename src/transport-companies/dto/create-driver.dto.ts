import { IsString, IsEmail, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';

export class CreateDriverDto {
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsNotEmpty()
  @IsString()
  driversLicenseNumber: string;

  @IsEnum(['Motorcycle', 'Tricycle', 'Car'])
  vehicleType: string;

  @IsOptional()
  @IsString()
  vehiclePlateNumber?: string;
}
