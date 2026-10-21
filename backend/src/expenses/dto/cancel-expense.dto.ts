//backend/src/expenses/dto/cancel-expense.dto.ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelExpenseDto {
  @IsString() @MinLength(3) @MaxLength(500)
  reason: string;
}
