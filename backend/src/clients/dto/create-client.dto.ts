import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, MinLength, ValidateNested } from 'class-validator';

class FirstProjectDto {
  @IsString() @MinLength(2)
  name: string;

  @IsOptional() @IsString()
  motif?: string;

  @IsOptional() @IsString()
  constructionType?: string;

  @IsOptional() @IsString()
  location?: string;

  @IsOptional() @IsString()
  city?: string;

  @IsOptional() @IsString()
  country?: string;

  @IsOptional() @IsDateString()
  startDate?: string;

  @IsOptional() @IsDateString()
  endDate?: string;

  @IsOptional() @IsInt()
  estimatedDurationDays?: number;

  @IsOptional() @IsNumber()
  surfaceArea?: number;

  @IsOptional() @IsInt()
  roomCount?: number;

  @IsOptional() @IsString()
  projectType?: string;

  @IsOptional() @IsNumber()
  estimatedCost?: number;

  @IsNumber() @IsPositive()
  budget: number;

  @IsOptional() @IsString()
  currency?: string;
}

/** Creation d'un client par le superadmin (section 7). */
export class CreateClientDto {
  // Informations personnelles
  @IsEmail()
  email: string;

  @IsString() @MinLength(1)
  firstName: string;

  @IsString() @MinLength(1)
  lastName: string;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsString()
  profession?: string;

  @IsOptional() @IsString()
  address?: string;

  @IsOptional() @IsString()
  city?: string;

  @IsOptional() @IsString()
  country?: string;

  // Informations professionnelles
  @IsOptional() @IsString()
  companyName?: string;

  @IsOptional() @IsString()
  companyAddress?: string;

  @IsOptional() @IsString()
  taxId?: string;

  // Premier projet (optionnel - section 7 "Premier projet")
  @IsOptional()
  @ValidateNested()
  @Type(() => FirstProjectDto)
  firstProject?: FirstProjectDto;
}
