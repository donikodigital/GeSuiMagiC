//backend/src/clients/dto/update-own-profile.dto.ts
import { IsOptional, IsString } from 'class-validator';

/** Le client ne peut modifier que certaines informations personnelles (section 5). */
export class UpdateOwnClientProfileDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() profession?: string;
}
