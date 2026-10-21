//backend/src/deposits/dto/create-deposit.dto.ts
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { IsMoneyAmount } from '../../common/validators/money-amount.decorator';

/** Depot cree par le client (section 13). */
export class CreateDepositDto {
  @IsUUID()
  supervisorId!: string;

  @IsMoneyAmount()
  amount!: number;

  // La devise d'un depot est TOUJOURS celle du projet (sinon les totaux du portefeuille melangent des devises) :
  // ce champ est conserve pour compatibilite et refuse s'il differe de la devise du projet.
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/, { message: 'La devise doit etre un code de 3 lettres majuscules (ex: GNF).' })
  currency?: string;

  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsString() @MaxLength(500) motif?: string;

  @IsOptional() @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsString() @MaxLength(2000) observation?: string;
}
