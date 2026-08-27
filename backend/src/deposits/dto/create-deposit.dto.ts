// backend/src/deposits/dto/create-deposit.dto.ts
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

/** Depot cree par le client (section 13). */
export class CreateDepositDto {
  @IsString()
  supervisorId!: string;

  @IsNumber() @IsPositive()
  amount!: number;

  @IsOptional() @IsString() currency?: string;

  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsString() motif?: string;

  @IsOptional() @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() observation?: string;
}