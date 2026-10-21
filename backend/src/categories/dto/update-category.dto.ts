//backend/src/categories/dto/update-category.dto.ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Modification partielle : seuls les champs fournis changent. Le proprietaire ne peut pas etre modifie. */
export class UpdateCategoryDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  name?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  group?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
