//backend/src/clients/dto/update-own-profile.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Le client ne peut modifier que certaines informations personnelles (section 5). */
export class UpdateOwnClientProfileDto {
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(200) city?: string;
  @IsOptional() @IsString() @MaxLength(200) profession?: string;
}
