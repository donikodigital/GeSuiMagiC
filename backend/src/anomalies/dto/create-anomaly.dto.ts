//backend/src/anomalies/dto/create-anomaly.dto.ts
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export const ANOMALY_CATEGORIES = [
  'depense_inconnue',
  'montant_incorrect',
  'doublon',
  'justificatif_absent',
  'materiau_suspect',
  'autre',
] as const;

/** Signalement d'anomalie par le client (section 62). */
export class CreateAnomalyDto {
  @IsIn(ANOMALY_CATEGORIES as unknown as string[])
  category: string;

  /** Depense concernee : doit appartenir au projet (verifie par le service). */
  @IsOptional() @IsUUID()
  relatedExpenseId?: string;

  @IsString() @MinLength(5) @MaxLength(2000)
  description: string;
}
