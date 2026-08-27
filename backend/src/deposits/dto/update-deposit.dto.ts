// backend/src/deposits/dto/update-deposit.dto.ts
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

/** Edition libre reservee au superadmin - tous les champs sont optionnels. */
export class UpdateDepositDto {
  @IsOptional() @IsNumber() @IsPositive() amount?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() motif?: string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() observation?: string;
}