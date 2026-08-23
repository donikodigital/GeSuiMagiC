import { IsEnum, IsNumber, IsOptional } from 'class-validator';
import { ExpensePaymentStatus } from '@prisma/client';

/** Mise a jour du statut de paiement fournisseur (n'affecte jamais le solde du chantier). */
export class UpdateExpensePaymentDto {
  @IsEnum(ExpensePaymentStatus)
  paymentStatus: ExpensePaymentStatus;

  @IsOptional() @IsNumber()
  amountPaidToSupplier?: number;
}
