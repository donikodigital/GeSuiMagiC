//backend/src/quality/dto/quality.dto.ts
import { ReceptionType, SnagSeverity, SnagStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { ISO_DATE_REGEX } from '../../common/utils/month.util';

export class CreateSnagDto {
  @IsString() @MinLength(3) @MaxLength(200)
  title!: string;

  @IsOptional() @IsString() @MaxLength(3000)
  description?: string;

  /** Ou se trouve le defaut (ex: « Salon, mur nord »). */
  @IsOptional() @IsString() @MaxLength(200)
  location?: string;

  @IsOptional() @IsEnum(SnagSeverity)
  severity?: SnagSeverity;

  @IsOptional() @IsUUID()
  phaseId?: string;

  /** Date limite de levee (AAAA-MM-JJ). */
  @IsOptional() @Matches(ISO_DATE_REGEX, { message: 'La date doit être au format AAAA-MM-JJ.' })
  dueDate?: string;

  @IsOptional() @IsString() @MinLength(8) @MaxLength(64)
  clientRef?: string;
}

export class UpdateSnagDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsEnum(SnagSeverity) severity?: SnagSeverity;
  @IsOptional() @IsUUID() phaseId?: string | null;
  @IsOptional() @Matches(ISO_DATE_REGEX, { message: 'La date doit être au format AAAA-MM-JJ.' }) dueDate?: string | null;
}

export class TransitionSnagDto {
  @IsIn(['OPEN', 'FIXED', 'CLOSED'])
  to!: 'OPEN' | 'FIXED' | 'CLOSED';

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

export class SnagQueryDto {
  @IsOptional() @IsEnum(SnagStatus) status?: SnagStatus;
  @IsOptional() @IsEnum(SnagSeverity) severity?: SnagSeverity;
  @IsOptional() @IsUUID() phaseId?: string;
}

export class CreateReceptionDto {
  @IsEnum(ReceptionType)
  type!: ReceptionType;

  /** Obligatoire pour une reception d'etape. */
  @IsOptional() @IsUUID()
  phaseId?: string;

  @Matches(ISO_DATE_REGEX, { message: 'La date doit être au format AAAA-MM-JJ.' })
  date!: string;

  @IsOptional() @IsString() @MaxLength(3000)
  notes?: string;

  /** Personnes presentes (une par ligne ou separees par des virgules). */
  @IsOptional() @IsString() @MaxLength(1000)
  attendees?: string;
}
