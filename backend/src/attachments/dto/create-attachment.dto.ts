//backend/src/attachments/dto/create-attachment.dto.ts
import { IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, MinLength } from 'class-validator';
import { ATTACHMENT_ABSOLUTE_MAX_BYTES, ATTACHMENT_KINDS, ATTACHMENT_MIME_TYPES } from '../attachment.constants';

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
}
