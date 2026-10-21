//backend/src/attachments/dto/presign-upload.dto.ts
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ATTACHMENT_KINDS, ATTACHMENT_MIME_TYPES } from '../attachment.constants';

export class PresignUploadDto {
  @IsString() @MinLength(1) @MaxLength(255)
  fileName: string;

  @IsIn(ATTACHMENT_MIME_TYPES as unknown as string[], { message: 'Formats acceptes : JPG, JPEG, PNG, PDF.' })
  mimeType: string;

  @IsIn(ATTACHMENT_KINDS as unknown as string[])
  kind: string;
}
