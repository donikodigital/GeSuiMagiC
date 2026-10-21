//backend/src/units/dto/update-unit.dto.ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Modification partielle : seuls les champs fournis changent. Le proprietaire ne peut pas etre modifie. */
export class UpdateUnitDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(60)
  name?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(20)
  symbol?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
