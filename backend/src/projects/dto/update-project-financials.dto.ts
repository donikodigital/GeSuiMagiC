import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/**
 * Champs financiers du projet : reserves au superadmin (budget/devise) et
 * au client pour son propre seuil de validation des depenses (section 19 +
 * demande explicite : seuil dynamique configurable par projet).
 */
export class UpdateProjectFinancialsDto {
  @IsOptional() @IsNumber() @IsPositive() budget?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @IsPositive() estimatedCost?: number;
  @IsOptional() @IsBoolean() autoApproveExpenses?: boolean;
  @IsOptional() @IsNumber() expenseApprovalThreshold?: number;
}
