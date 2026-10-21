//backend/src/expenses/dto/update-expense-payment.dto.ts
import { IsEnum, IsNumber, IsOptional, Max } from 'class-validator';
import { ExpensePaymentStatus } from '@prisma/client';
import { MAX_INPUT_AMOUNT } from '../../common/validators/money-amount.decorator';

/** Mise a jour du statut de paiement fournisseur (n'affecte jamais le solde du chantier). */
export class UpdateExpensePaymentDto {
  @IsEnum(ExpensePaymentStatus)
  paymentStatus: ExpensePaymentStatus;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Max(MAX_INPUT_AMOUNT)
  amountPaidToSupplier?: number;
}
