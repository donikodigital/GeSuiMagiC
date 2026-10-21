//backend/src/meals/dto/delete-carry-over.dto.ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteCarryOverDto {
  @IsString() @MinLength(3, { message: "Un motif d'annulation est obligatoire." }) @MaxLength(500)
  reason!: string;
}
