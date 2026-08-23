import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';
import { ExpensePaymentStatus } from '@prisma/client';

/** Depense enregistree par le superviseur (section 18). */
export class CreateExpenseDto {
  @IsOptional() @IsDateString()
  date?: string;

  @IsString()
  categoryId: string;

  @IsOptional() @IsString()
  materialId?: string;

  @IsString() @MinLength(1)
  label: string;

  @IsNumber() @IsPositive()
  quantity: number;

  @IsString()
  unit: string;

  @IsNumber() @IsPositive()
  unitPrice: number;

  @IsOptional() @IsString() observation?: string;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() invoiceReference?: string;

  // Suivi du reste a payer au fournisseur (ajout demande par le client - n'affecte jamais le solde chantier)
  @IsOptional() @IsEnum(ExpensePaymentStatus)
  paymentStatus?: ExpensePaymentStatus;

  @IsOptional() @IsNumber()
  amountPaidToSupplier?: number;
}
