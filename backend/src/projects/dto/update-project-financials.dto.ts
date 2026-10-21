//backend/src/projects/dto/update-project-financials.dto.ts
import { IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
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
}
