//backend/src/clients/dto/create-client.dto.ts
import { Type } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { CreateProjectDto } from '../../projects/dto/create-project.dto';

/** Creation d'un client par le superadmin (section 7). */
export class CreateClientDto {
  // Informations personnelles
  @IsEmail() @MaxLength(254)
  email: string;

  @IsString() @MinLength(1) @MaxLength(100)
  firstName: string;

  @IsString() @MinLength(1) @MaxLength(100)
  lastName: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(200)
  profession?: string;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;

  @IsOptional() @IsString() @MaxLength(200)
  city?: string;

  @IsOptional() @IsString() @MaxLength(200)
  country?: string;

  // Informations professionnelles
  @IsOptional() @IsString() @MaxLength(200)
  companyName?: string;

  @IsOptional() @IsString() @MaxLength(500)
  companyAddress?: string;

  @IsOptional() @IsString() @MaxLength(100)
  taxId?: string;

  // Premier projet (optionnel - section 7 "Premier projet"). Memes regles de validation qu'un projet cree normalement
  // (avant : montants et textes non bornes, devise libre).
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateProjectDto)
  firstProject?: CreateProjectDto;
}
