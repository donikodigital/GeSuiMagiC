//backend/src/expenses/dto/correct-expense.dto.ts
import { IsString, MaxLength, MinLength } from 'class-validator';
import { IsMoneyAmount } from '../../common/validators/money-amount.decorator';

export class CorrectExpenseDto {
  @IsMoneyAmount()
  newTotal: number;

  @IsString() @MinLength(3) @MaxLength(500)
  reason: string;
}
