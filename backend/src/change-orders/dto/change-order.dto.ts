//backend/src/change-orders/dto/change-order.dto.ts
import { ChangeOrderStatus } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_INPUT_AMOUNT } from '../../common/validators/money-amount.decorator';

/** Avenant : travaux supplementaires ou modification demandes en cours de chantier, a faire valider par le client. */
export class CreateChangeOrderDto {
  @IsString() @MinLength(3) @MaxLength(200)
  title!: string;

  @IsString() @MinLength(3) @MaxLength(3000)
  description!: string;

  /** Surcout (peut etre 0 pour une simple modification de delai). */
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_INPUT_AMOUNT)
  extraCost!: number;

  @IsOptional() @IsInt() @Min(0) @Max(3650)
  extraDays?: number;

  @IsOptional() @IsUUID()
  phaseId?: string;
}

export class DecideChangeOrderDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

export class CancelChangeOrderDto {
  @IsString() @MinLength(3) @MaxLength(1000)
  reason!: string;
}

export class ChangeOrderQueryDto {
  @IsOptional() @IsEnum(ChangeOrderStatus)
  status?: ChangeOrderStatus;
}
