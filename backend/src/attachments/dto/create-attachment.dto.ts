import { IsIn, IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

/** Section 32 : enregistre les metadonnees d'un fichier deja televerse sur le stockage objet. */
export class CreateAttachmentDto {
  @IsString() @MinLength(1)
  fileName: string;

  @IsString()
  fileUrl: string;

  @IsString()
  mimeType: string;

  @IsInt() @IsPositive()
  fileSizeBytes: number;

  @IsIn(['photo', 'facture', 'recu', 'bon_livraison', 'document'])
  kind: string;

  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() depositId?: string;
  @IsOptional() @IsString() expenseId?: string;
}
