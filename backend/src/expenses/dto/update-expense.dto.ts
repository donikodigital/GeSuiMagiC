//backend/src/expenses/dto/update-expense.dto.ts
import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength } from 'class-validator';
import { ExpensePaymentStatus } from '@prisma/client';
import { IsMoneyAmount, MAX_INPUT_AMOUNT } from '../../common/validators/money-amount.decorator';
import { MAX_QUANTITY } from './create-expense.dto';

/** Edition libre reservee au superadmin - tous les champs sont optionnels. */
export class UpdateExpenseDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() materialId?: string;
  @IsOptional() @IsString() @MaxLength(200) label?: string;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 }) @IsPositive() @Max(MAX_QUANTITY) quantity?: number;
  @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @IsOptional() @IsMoneyAmount() unitPrice?: number;
  @IsOptional() @IsString() @MaxLength(2000) observation?: string;
  @IsOptional() @IsString() @MaxLength(200) supplier?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceReference?: string;
  @IsOptional() @IsIn(['PAID_FULL', 'PARTIAL', 'CREDIT']) paymentStatus?: ExpensePaymentStatus;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Max(MAX_INPUT_AMOUNT) amountPaidToSupplier?: number;
}
