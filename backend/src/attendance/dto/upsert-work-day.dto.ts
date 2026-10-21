//backend/src/attendance/dto/upsert-work-day.dto.ts
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { MAX_WORKERS_PER_DAY } from '../attendance.constants';

/**
 * Saisie d'un jour. Si le jour est travaille : effectif (>= 1) et etape obligatoires.
 * Sinon l'effectif et l'etape sont ignores (jour explicitement non travaille : pluie, fete, arret...).
 */
export class UpsertWorkDayDto {
  @IsBoolean()
  isWorked!: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(MAX_WORKERS_PER_DAY)
  workersCount?: number;

  @IsOptional() @IsUUID()
  phaseId?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
