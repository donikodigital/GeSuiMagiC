//backend/src/anomalies/dto/create-anomaly.dto.ts
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

/** Signalement d'anomalie par le client (section 62). */
export class CreateAnomalyDto {
  @IsIn(['depense_inconnue', 'montant_incorrect', 'doublon', 'justificatif_absent', 'materiau_suspect', 'autre'])
  category: string;

  @IsOptional() @IsString()
  relatedExpenseId?: string;

  @IsString() @MinLength(5)
  description: string;
}
