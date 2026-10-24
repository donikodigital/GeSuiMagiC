//backend/src/site-logs/dto/site-log.dto.ts
import { WeatherCondition } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ISO_DATE_REGEX } from '../../common/utils/month.util';

export class CreateSiteLogDto {
  /** Date du journal (AAAA-MM-JJ) ; aujourd'hui par defaut. */
  @IsOptional() @Matches(ISO_DATE_REGEX, { message: 'La date doit être au format AAAA-MM-JJ.' })
  date?: string;

  @IsString() @MinLength(2) @MaxLength(150)
  title!: string;

  @IsString() @MinLength(2) @MaxLength(5000)
  content!: string;

  @IsOptional() @IsEnum(WeatherCondition)
  weather?: WeatherCondition;

  @IsOptional() @IsUUID()
  phaseId?: string;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-90) @Max(90)
  latitude?: number;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-180) @Max(180)
  longitude?: number;

  /** Identifiant genere par l'appareil (saisie hors ligne rejouable sans doublon). */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(64)
  clientRef?: string;
}

export class UpdateSiteLogDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150)
  title?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(5000)
  content?: string;

  @IsOptional() @IsEnum(WeatherCondition)
  weather?: WeatherCondition;

  @IsOptional() @IsUUID()
  phaseId?: string | null;
}

export class SiteLogQueryDto extends PaginationQueryDto {
  @IsOptional() @Matches(ISO_DATE_REGEX) from?: string;
  @IsOptional() @Matches(ISO_DATE_REGEX) to?: string;
  @IsOptional() @IsUUID() phaseId?: string;
}
