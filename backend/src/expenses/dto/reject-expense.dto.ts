//backend/src/expenses/dto/reject-expense.dto.ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectExpenseDto {
  @IsString() @MinLength(3) @MaxLength(500)
  reason: string;
}
