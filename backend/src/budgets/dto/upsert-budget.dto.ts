//backend/src/budgets/dto/upsert-budget.dto.ts
import { IsUUID } from 'class-validator';
import { IsMoneyAmount } from '../../common/validators/money-amount.decorator';

/** Budget previsionnel par categorie (section 43). */
export class UpsertBudgetDto {
  @IsUUID()
  categoryId: string;

  @IsMoneyAmount()
  amount: number;
}
