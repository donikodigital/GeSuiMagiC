// backend/src/projects/dto/create-project.dto.ts - v1.1
// Ajout de autoApproveExpenses et expenseApprovalThreshold, optionnels -
// permet au client de choisir son propre seuil des la creation du projet
// au lieu de subir silencieusement le defaut Prisma (5 000 000, conserve
// uniquement comme filet de securite technique si le champ est omis).

import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

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

  @IsOptional() @IsBoolean() autoApproveExpenses?: boolean;
  @IsOptional() @IsNumber() @IsPositive() expenseApprovalThreshold?: number;

  // Client uniquement renseigne par le superadmin lors d'une creation "pour le compte de" (rare) ;
  // sinon deduit automatiquement de l'utilisateur connecte (role CLIENT).
  @IsOptional() @IsString() clientId?: string;
}