//backend/src/attendance/dto/create-phase.dto.ts
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePhaseDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MinLength(2, { message: "Le nom de l'étape est obligatoire." }) @MaxLength(80)
  name!: string;
}
