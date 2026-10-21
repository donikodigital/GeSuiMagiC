//backend/src/attendance/dto/update-phase.dto.ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePhaseDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MinLength(2) @MaxLength(80)
  name?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
