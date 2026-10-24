//backend/src/workforce/dto/workforce.dto.ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { IsMoneyAmount, MAX_INPUT_AMOUNT } from '../../common/validators/money-amount.decorator';
import { ISO_DATE_REGEX } from '../../common/utils/month.util';

const DATE_MSG = { message: 'La date doit être au format AAAA-MM-JJ.' };
const MONEY0 = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 } as const;

export class CreateWorkerDto {
  @IsString() @MinLength(2) @MaxLength(150) fullName!: string;
  @IsOptional() @IsString() @MaxLength(100) trade?: string;
  @IsOptional() @IsNumber(MONEY0) @Min(0) @Max(MAX_INPUT_AMOUNT) dailyRate?: number;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @Matches(ISO_DATE_REGEX, DATE_MSG) startedAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateWorkerDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) fullName?: string;
  @IsOptional() @IsString() @MaxLength(100) trade?: string;
  @IsOptional() @IsNumber(MONEY0) @Min(0) @Max(MAX_INPUT_AMOUNT) dailyRate?: number;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Matches(ISO_DATE_REGEX, DATE_MSG) leftAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class PresenceEntryDto {
  @IsUUID() workerId!: string;
  /** 0 = absent (supprime la presence), 0.5 = demi-journee, 1 = journee complete. */
  @IsIn([0, 0.5, 1]) fraction!: 0 | 0.5 | 1;
  @IsOptional() @IsUUID() phaseId?: string;
}

export class SetPresencesDto {
  @Matches(ISO_DATE_REGEX, DATE_MSG) date!: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => PresenceEntryDto)
  entries!: PresenceEntryDto[];
}

export class PresenceQueryDto {
  @Matches(ISO_DATE_REGEX, DATE_MSG) from!: string;
  @Matches(ISO_DATE_REGEX, DATE_MSG) to!: string;
}

export class CreateAdvanceDto {
  @IsMoneyAmount() amount!: number;
  @IsOptional() @Matches(ISO_DATE_REGEX, DATE_MSG) date?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreatePayRunDto {
  @IsString() @MinLength(3) @MaxLength(150) label!: string;
  @Matches(ISO_DATE_REGEX, DATE_MSG) periodStart!: string;
  @Matches(ISO_DATE_REGEX, DATE_MSG) periodEnd!: string;
}

export class PayLineEditDto {
  @IsUUID() workerId!: string;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(366) daysWorked?: number;
  @IsOptional() @IsNumber(MONEY0) @Min(0) @Max(MAX_INPUT_AMOUNT) dailyRate?: number;
  /** Marche a la tache : montant forfaitaire (remplace jours x taux). */
  @IsOptional() @IsNumber(MONEY0) @Min(0.01) @Max(MAX_INPUT_AMOUNT) taskAmount?: number;
  @IsOptional() @IsNumber(MONEY0) @Min(0) @Max(MAX_INPUT_AMOUNT) advanceDeducted?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class EditPayRunLinesDto {
  /** Remplace l'ensemble des lignes du brouillon. */
  @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => PayLineEditDto)
  lines!: PayLineEditDto[];
}

export class SubmitPayRunDto {
  @IsUUID() categoryId!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(64) clientRef?: string;
}
