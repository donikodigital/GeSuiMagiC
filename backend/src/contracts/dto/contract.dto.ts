//backend/src/contracts/dto/contract.dto.ts
import { ContractPaymentType } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IsMoneyAmount, MAX_INPUT_AMOUNT } from '../../common/validators/money-amount.decorator';
import { ISO_DATE_REGEX } from '../../common/utils/month.util';

export class CreateContractDto {
  @IsUUID()
  supplierId!: string;

  @IsString() @MinLength(3) @MaxLength(200)
  title!: string;

  @IsOptional() @IsString() @MaxLength(3000)
  description?: string;

  @IsMoneyAmount()
  amount!: number;

  /** Retenue de garantie en % de chaque situation (5 % par defaut). */
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(20)
  retentionPercent?: number;

  @IsOptional() @IsUUID()
  phaseId?: string;

  @IsOptional() @Matches(ISO_DATE_REGEX, { message: 'La date doit être au format AAAA-MM-JJ.' })
  signedAt?: string;
}

export class UpdateContractDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsMoneyAmount() amount?: number;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(20) retentionPercent?: number;
  @IsOptional() @IsUUID() phaseId?: string | null;
  @IsOptional() @Matches(ISO_DATE_REGEX) signedAt?: string | null;
}

export class SubmitStatementDto {
  /** Fin de la periode couverte (AAAA-MM-JJ). */
  @Matches(ISO_DATE_REGEX, { message: 'La date doit être au format AAAA-MM-JJ.' })
  periodEnd!: string;

  /** Cumul des travaux realises depuis le debut du marche (et non le montant de la periode seule). */
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0.01) @Max(MAX_INPUT_AMOUNT)
  cumulativeAmount!: number;

  /** Acompte recupere sur cette situation. */
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_INPUT_AMOUNT)
  advanceRecovered?: number;

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

export class DecideStatementDto {
  @IsIn(['VALIDATED', 'REJECTED'])
  decision!: 'VALIDATED' | 'REJECTED';

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

export class RecordContractPaymentDto {
  @IsEnum(ContractPaymentType)
  type!: ContractPaymentType;

  @IsMoneyAmount()
  amount!: number;

  /** Categorie de depense sous laquelle le paiement est comptabilise (ex: « Sous-traitance »). */
  @IsUUID()
  categoryId!: string;

  @IsOptional() @IsDateString()
  date?: string;

  /** Obligatoire pour un paiement de situation. */
  @IsOptional() @IsUUID()
  statementId?: string;

  @IsOptional() @IsString() @MaxLength(100)
  reference?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-90) @Max(90)
  latitude?: number;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-180) @Max(180)
  longitude?: number;

  @IsOptional() @IsString() @MinLength(8) @MaxLength(64)
  clientRef?: string;
}

export class CancelContractDto {
  @IsString() @MinLength(3) @MaxLength(1000)
  reason!: string;
}
