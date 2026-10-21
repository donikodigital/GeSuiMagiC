//backend/src/supervisors/dto/create-supervisor.dto.ts
import { IsEmail, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

/** Creation d'un superviseur par le client (section 10). */
export class CreateSupervisorDto {
  @IsEmail() @MaxLength(254)
  email: string;

  @IsString() @MinLength(1) @MaxLength(100)
  firstName: string;

  @IsString() @MinLength(1) @MaxLength(100)
  lastName: string;

  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(200) profession?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;

  // Adresses https uniquement (photoUrl est affichee dans une balise <img> : pas de schemas javascript:/data:).
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(1024) photoUrl?: string;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(1024) idDocumentUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
