import { IsOptional, IsString, IsEnum } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'PENDING', 'REJECTED', 'SUSPENDED'])
  status?: string;
}
