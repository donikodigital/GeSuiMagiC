//backend/src/quotes/dto/quote.dto.ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { IsMoneyAmount, MAX_INPUT_AMOUNT } from '../../common/validators/money-amount.decorator';
import { ISO_DATE_REGEX } from '../../common/utils/month.util';

export class LotItemDto {
  /** Present pour modifier un poste existant ; absent pour en creer un. */
  @IsOptional() @IsUUID()
  id?: string;

  @IsString() @MinLength(2) @MaxLength(200)
  label!: string;

  @IsString() @MinLength(1) @MaxLength(20)
  unit!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 }) @Min(0.001) @Max(100_000_000)
  quantity!: number;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_INPUT_AMOUNT)
  estimatedUnitPrice?: number;
}

export class CreateLotDto {
  @IsString() @MinLength(3) @MaxLength(200)
  title!: string;

  @IsOptional() @IsString() @MaxLength(3000)
  description?: string;

  @IsOptional() @IsUUID()
  phaseId?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => LotItemDto)
  items!: LotItemDto[];
}

export class UpdateLotDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsUUID() phaseId?: string | null;

  /** Remplace le metre : les postes absents de la liste sont supprimes (impossible une fois des devis recus). */
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => LotItemDto)
  items?: LotItemDto[];
}

export class QuoteLineDto {
  /** Poste du metre chiffre (absent = ligne libre ajoutee par le fournisseur). */
  @IsOptional() @IsUUID()
  itemId?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(200)
  label?: string;

  @IsOptional() @IsString() @MaxLength(20)
  unit?: string;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 }) @Min(0.001) @Max(100_000_000)
  quantity?: number;

  @IsMoneyAmount()
  unitPrice!: number;
}

export class UpsertQuoteDto {
  @IsUUID()
  supplierId!: string;

  @IsOptional() @IsString() @MaxLength(100) reference?: string;

  @IsOptional() @Matches(ISO_DATE_REGEX, { message: 'La date doit être au format AAAA-MM-JJ.' })
  validUntil?: string;

  @IsOptional() @IsString() @MaxLength(1000) notes?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => QuoteLineDto)
  lines!: QuoteLineDto[];
}

export class AwardContractOptionsDto {
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(20)
  retentionPercent?: number;
}

export class AwardLotDto {
  @IsUUID()
  quoteId!: string;

  /** Si renseigne, un marche de sous-traitance est cree automatiquement au montant du devis retenu. */
  @IsOptional() @ValidateNested() @Type(() => AwardContractOptionsDto)
  createContract?: AwardContractOptionsDto;
}
