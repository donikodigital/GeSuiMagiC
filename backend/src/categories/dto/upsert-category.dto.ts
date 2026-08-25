//backend/src/categories/dto/upsert-category.dto.ts
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertCategoryDto {
  @IsString() @MinLength(1)
  name: string;

  @IsOptional() @IsString()
  group?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
