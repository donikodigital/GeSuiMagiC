//backend/src/projects/dto/update-project-financials.dto.ts
import { IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';
import { IsMoneyAmount, MAX_INPUT_AMOUNT } from '../../common/validators/money-amount.decorator';

/**
 * Champs financiers du projet : reserves au superadmin (devise, cout estimatif) et
 * au client pour son budget et son propre seuil de validation des depenses (section 19 +
 * demande explicite : seuil dynamique configurable par projet).
 */
export class UpdateProjectFinancialsDto {
  @IsOptional() @IsMoneyAmount() budget?: number;

  // Modifiable uniquement tant que le projet n'a aucun depot ni aucune depense (les montants ne sont jamais convertis).
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/, { message: 'La devise doit etre un code de 3 lettres majuscules (ex: GNF).' })
  currency?: string;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_INPUT_AMOUNT) estimatedCost?: number;
  @IsOptional() @IsBoolean() autoApproveExpenses?: boolean;

  // 0 = toute depense doit etre confirmee par le client.
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_INPUT_AMOUNT) expenseApprovalThreshold?: number;

  // Controles anti-fraude. `null` desactive le controle ; 0 = toujours exige.
  /** Au-dessus de ce montant, la depense exige un justificatif (facture, recu, bon de livraison) pour etre validee. */
  @IsOptional() @ValidateIf((_, value) => value !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_INPUT_AMOUNT)
  receiptRequiredAbove?: number | null;

  /** Au-dessus de ce montant, la depense passe d'abord par la validation technique (conducteur de travaux / architecte). */
  @IsOptional() @ValidateIf((_, value) => value !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_INPUT_AMOUNT)
  technicalReviewAbove?: number | null;
}
