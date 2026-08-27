//backend/src/deposits/dto/correct-amount.dto.ts
import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

/** Correction administrative (section 16/53) : ne remplace jamais silencieusement une valeur. */
export class CorrectAmountDto {
  @IsNumber() @IsPositive()
  newAmount: number;

  @IsString() @MinLength(3)
  reason: string;
}
