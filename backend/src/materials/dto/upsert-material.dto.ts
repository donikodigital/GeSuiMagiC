//backend/src/materials/dto/upsert-material.dto.ts
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertMaterialDto {
  @IsString() @MinLength(1)
  name: string;

  @IsString()
  categoryId: string;

  @IsOptional() @IsString()
  defaultUnitId?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
