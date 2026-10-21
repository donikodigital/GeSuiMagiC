//backend/src/supervisors/dto/update-own-profile.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Le superviseur ne peut modifier que certaines informations personnelles. */
export class UpdateOwnSupervisorProfileDto {
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(200) profession?: string;
}
