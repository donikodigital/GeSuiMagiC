//backend/src/categories/dto/upsert-category.dto.ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpsertCategoryDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  name: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  group?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  /** Superadmin uniquement, a la creation : cree l'entree pour ce client (sinon entree globale). Ignore a la modification. */
  @IsOptional() @IsUUID()
  ownerClientId?: string;
}
