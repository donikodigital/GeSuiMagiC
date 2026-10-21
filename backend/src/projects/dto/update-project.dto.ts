//backend/src/projects/dto/update-project.dto.ts
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Champs non-financiers modifiables par le client (section 5/9). */
export class UpdateProjectDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) name?: string;
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
  @IsOptional() @IsInt() @Min(0) @Max(100) progressPercent?: number;
}
