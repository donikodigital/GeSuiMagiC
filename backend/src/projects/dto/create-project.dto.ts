//backend/src/projects/dto/create-project.dto.ts
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IsMoneyAmount, MAX_INPUT_AMOUNT } from '../../common/validators/money-amount.decorator';

export class CreateProjectDto {
  @IsString() @MinLength(2) @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(1000) motif?: string;
  @IsOptional() @IsString() @MaxLength(200) constructionType?: string;
  @IsOptional() @IsString() @MaxLength(500) location?: string;
  @IsOptional() @IsString() @MaxLength(200) city?: string;
  @IsOptional() @IsString() @MaxLength(200) country?: string;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000_000) surfaceArea?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000) roomCount?: number;
  @IsOptional() @IsString() @MaxLength(200) projectType?: string;

  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(36_500) estimatedDurationDays?: number;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_INPUT_AMOUNT) estimatedCost?: number;

  @IsMoneyAmount()
  budget: number;

  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/, { message: 'La devise doit etre un code de 3 lettres majuscules (ex: GNF).' })
  currency?: string;

  @IsOptional() @IsBoolean() autoApproveExpenses?: boolean;

  // 0 = toute depense doit etre confirmee par le client.
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_INPUT_AMOUNT) expenseApprovalThreshold?: number;

  // Client uniquement renseigne par le superadmin lors d'une creation "pour le compte de" (rare) ;
  // sinon deduit automatiquement de l'utilisateur connecte (role CLIENT).
  @IsOptional() @IsUUID() clientId?: string;
}
