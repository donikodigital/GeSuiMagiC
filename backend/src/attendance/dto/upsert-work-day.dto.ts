//backend/src/attendance/dto/upsert-work-day.dto.ts
import { WorkStopReason } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
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

  /** Raison de l'arret quand le jour n'est pas travaille (pluie, rupture de materiaux, panne...). */
  @IsOptional() @IsEnum(WorkStopReason)
  stopReason?: WorkStopReason;

  /** Position de l'appareil a la saisie (controle de presence sur le chantier, jamais bloquant). */
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-90) @Max(90)
  latitude?: number;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-180) @Max(180)
  longitude?: number;
}
