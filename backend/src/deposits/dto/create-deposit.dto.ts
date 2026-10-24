//backend/src/deposits/dto/create-deposit.dto.ts
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { IsMoneyAmount, MAX_INPUT_AMOUNT } from '../../common/validators/money-amount.decorator';

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

  // Envoi depuis l'etranger : montant d'origine, devise d'origine, taux obtenu et frais de transfert.
  // Ces champs vont ensemble (montant + devise + taux) ; `amount` reste le montant CREDITE en devise du projet.
  @IsOptional() @IsMoneyAmount()
  originalAmount?: number;

  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/, { message: "La devise d'origine doit être un code de 3 lettres majuscules (ex: EUR)." })
  originalCurrency?: string;

  /** 1 unite de devise d'origine = X unites de la devise du projet. */
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 }) @Min(0.000001) @Max(1_000_000_000)
  exchangeRate?: number;

  /** Frais de transfert, en devise d'origine, payes en plus du montant envoye. */
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_INPUT_AMOUNT)
  transferFees?: number;
}
