//backend/src/progress/dto/progress.dto.ts
import { ReviewStatus } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Avancement declare par le superviseur pour une etape (a valider par le conducteur de travaux / l'architecte / le client). */
export class SubmitProgressDto {
  @IsUUID()
  phaseId!: string;

  @IsInt() @Min(0) @Max(100)
  percent!: number;

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;

  /** Identifiant genere par l'appareil (saisie hors ligne rejouable sans doublon). */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(64)
  clientRef?: string;
}

export class DecideProgressDto {
  @IsIn(['VALIDATED', 'REJECTED'])
  decision!: 'VALIDATED' | 'REJECTED';

  /** Obligatoire en cas de refus. */
  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

export class ProgressUpdatesQueryDto {
  @IsOptional() @IsUUID() phaseId?: string;
  @IsOptional() @IsEnum(ReviewStatus) status?: ReviewStatus;
}
