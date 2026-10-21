//backend/src/expenses/dto/create-expense.dto.ts
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, MinLength } from 'class-validator';
import { ExpensePaymentStatus } from '@prisma/client';
import { IsMoneyAmount, MAX_INPUT_AMOUNT } from '../../common/validators/money-amount.decorator';

/** Plus grande quantite stockable dans Decimal(14,3) : 11 chiffres avant la virgule. */
export const MAX_QUANTITY = 99_999_999_999;

/** Depense enregistree par le superviseur (section 18). */
export class CreateExpenseDto {
  @IsOptional() @IsDateString()
  date?: string;

  @IsUUID()
  categoryId: string;

  @IsOptional() @IsUUID()
  materialId?: string;

  @IsString() @MinLength(1) @MaxLength(200)
  label: string;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 }) @IsPositive() @Max(MAX_QUANTITY)
  quantity: number;

  @IsString() @MinLength(1) @MaxLength(30)
  unit: string;

  @IsMoneyAmount()
  unitPrice: number;

  @IsOptional() @IsString() @MaxLength(2000) observation?: string;
  @IsOptional() @IsString() @MaxLength(200) supplier?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceReference?: string;

  // Suivi du reste a payer au fournisseur (ajout demande par le client - n'affecte jamais le solde chantier)
  @IsOptional() @IsEnum(ExpensePaymentStatus)
  paymentStatus?: ExpensePaymentStatus;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Max(MAX_INPUT_AMOUNT)
  amountPaidToSupplier?: number;
}
