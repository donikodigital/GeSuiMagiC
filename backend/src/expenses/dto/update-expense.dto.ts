// backend/src/expenses/dto/update-expense.dto.ts
import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ExpensePaymentStatus } from '@prisma/client';

/** Edition libre reservee au superadmin - tous les champs sont optionnels. */
export class UpdateExpenseDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() materialId?: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsNumber() @IsPositive() quantity?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @IsPositive() unitPrice?: number;
  @IsOptional() @IsString() observation?: string;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() invoiceReference?: string;
  @IsOptional() @IsIn(['PAID_FULL', 'PARTIAL', 'CREDIT']) paymentStatus?: ExpensePaymentStatus;
  @IsOptional() @IsNumber() amountPaidToSupplier?: number;
}