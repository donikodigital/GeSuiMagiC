//backend/src/attachments/dto/create-attachment.dto.ts
import { IsDateString, IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, MinLength } from 'class-validator';
import { ATTACHMENT_ABSOLUTE_MAX_BYTES, ATTACHMENT_ENTITY_TYPES, ATTACHMENT_KINDS, ATTACHMENT_MIME_TYPES } from '../attachment.constants';

/** Section 32 : enregistre les metadonnees d'un fichier deja televerse sur le stockage objet. */
export class CreateAttachmentDto {
  @IsString() @MinLength(1) @MaxLength(255)
  fileName: string;

  /** URL renvoyee par /attachments/presign (verifiee cote serveur : doit appartenir a notre stockage). */
  @IsString() @MinLength(1) @MaxLength(1024)
  fileUrl: string;

  @IsIn(ATTACHMENT_MIME_TYPES as unknown as string[], { message: 'Formats acceptes : JPG, JPEG, PNG, PDF.' })
  mimeType: string;

  @IsInt() @IsPositive() @Max(ATTACHMENT_ABSOLUTE_MAX_BYTES)
  fileSizeBytes: number;

  @IsIn(ATTACHMENT_KINDS as unknown as string[])
  kind: string;

  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() depositId?: string;
  @IsOptional() @IsUUID() expenseId?: string;

  /** Autre objet du chantier (journal, reserve, livraison...) : exige projectId et entityId. */
  @IsOptional() @IsIn(ATTACHMENT_ENTITY_TYPES as unknown as string[])
  entityType?: string;

  @IsOptional() @IsUUID()
  entityId?: string;

  /** Instant de la prise de vue (ISO 8601), fourni par l'appareil. Jamais dans le futur. */
  @IsOptional() @IsDateString()
  capturedAt?: string;
}
