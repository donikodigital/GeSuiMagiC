//backend/src/projects/dto/update-project.dto.ts
import { IsDateString, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

/** Champs non-financiers modifiables par le client (section 5/9). */
export class UpdateProjectDto {
  @IsOptional() @IsString() name?: string;
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
  @IsOptional() @IsInt() progressPercent?: number;
}
