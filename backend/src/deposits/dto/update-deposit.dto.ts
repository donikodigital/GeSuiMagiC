//backend/src/deposits/dto/update-deposit.dto.ts
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { IsMoneyAmount } from '../../common/validators/money-amount.decorator';

/** Edition libre reservee au superadmin - tous les champs sont optionnels. */
export class UpdateDepositDto {
  @IsOptional() @IsMoneyAmount() amount?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() @MaxLength(500) motif?: string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsString() @MaxLength(2000) observation?: string;
}
