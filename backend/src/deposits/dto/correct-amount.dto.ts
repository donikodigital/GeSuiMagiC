//backend/src/deposits/dto/correct-amount.dto.ts
import { IsString, MaxLength, MinLength } from 'class-validator';
import { IsMoneyAmount } from '../../common/validators/money-amount.decorator';

/** Correction administrative (section 16/53) : ne remplace jamais silencieusement une valeur. */
export class CorrectAmountDto {
  @IsMoneyAmount()
  newAmount: number;

  @IsString() @MinLength(3) @MaxLength(500)
  reason: string;
}
