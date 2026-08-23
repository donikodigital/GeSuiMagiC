import { IsNumber, IsPositive, IsString } from 'class-validator';

/** Budget previsionnel par categorie (section 43). */
export class UpsertBudgetDto {
  @IsString()
  categoryId: string;

  @IsNumber() @IsPositive()
  amount: number;
}
