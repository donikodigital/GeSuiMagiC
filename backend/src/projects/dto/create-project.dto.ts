import { IsDateString, IsInt, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString() @MinLength(2)
  name: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() motif?: string;
  @IsOptional() @IsString() constructionType?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;

  @IsOptional() @IsNumber() surfaceArea?: number;
  @IsOptional() @IsInt() roomCount?: number;
  @IsOptional() @IsString() projectType?: string;

  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsInt() estimatedDurationDays?: number;

  @IsOptional() @IsNumber() estimatedCost?: number;

  @IsNumber() @IsPositive()
  budget: number;

  @IsOptional() @IsString() currency?: string;

  // Client uniquement renseigne par le superadmin lors d'une creation "pour le compte de" (rare) ;
  // sinon deduit automatiquement de l'utilisateur connecte (role CLIENT).
  @IsOptional() @IsString() clientId?: string;
}
