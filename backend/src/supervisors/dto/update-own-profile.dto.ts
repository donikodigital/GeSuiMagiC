// backend/src/supervisors/dto/update-own-profile.dto.ts
import { IsOptional, IsString } from 'class-validator';

/** Le superviseur ne peut modifier que certaines informations personnelles. */
export class UpdateOwnSupervisorProfileDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() profession?: string;
}