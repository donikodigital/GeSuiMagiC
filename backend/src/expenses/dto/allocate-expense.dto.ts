//backend/src/expenses/dto/allocate-expense.dto.ts
import { IsOptional, IsUUID } from 'class-validator';

/** Rattache une depense a une etape et/ou a un fournisseur de l'annuaire (null = retirer le rattachement). */
export class AllocateExpenseDto {
  @IsOptional() @IsUUID()
  phaseId?: string | null;

  @IsOptional() @IsUUID()
  supplierId?: string | null;
}
