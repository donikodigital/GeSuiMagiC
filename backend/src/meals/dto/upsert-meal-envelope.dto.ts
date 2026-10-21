//backend/src/meals/dto/upsert-meal-envelope.dto.ts
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsMoneyAmount } from '../../common/validators/money-amount.decorator';

/**
 * Enveloppe d'alimentation d'un mois : montant envoye pour le mois et cout d'un repas
 * par ouvrier et par jour travaille (sert a calculer ce que les presences justifient).
 */
export class UpsertMealEnvelopeDto {
  @IsMoneyAmount()
  allocatedAmount!: number;

  @IsMoneyAmount()
  mealUnitCost!: number;

  // Categorie de depenses qui represente l'alimentation (pour comparer avec les depenses reelles).
  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
