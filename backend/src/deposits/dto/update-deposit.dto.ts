//backend/src/deposits/dto/update-deposit.dto.ts
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { IsMoneyAmount, MAX_INPUT_AMOUNT } from '../../common/validators/money-amount.decorator';

/** Edition libre reservee au superadmin - tous les champs sont optionnels. */
export class UpdateDepositDto {
  @IsOptional() @IsMoneyAmount() amount?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() @MaxLength(500) motif?: string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsString() @MaxLength(2000) observation?: string;

  // Informations de change (n'affectent pas le portefeuille) : null = effacer.
  @IsOptional() @IsMoneyAmount() originalAmount?: number | null;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) originalCurrency?: string | null;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 }) @Min(0.000001) @Max(1_000_000_000) exchangeRate?: number | null;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_INPUT_AMOUNT) transferFees?: number | null;
}
