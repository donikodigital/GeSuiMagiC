//backend/src/attachments/dto/attachment-query.dto.ts
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ATTACHMENT_ENTITY_TYPES } from '../attachment.constants';

export class AttachmentQueryDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() depositId?: string;
  @IsOptional() @IsUUID() expenseId?: string;
  @IsOptional() @IsIn(ATTACHMENT_ENTITY_TYPES as unknown as string[]) entityType?: string;
  @IsOptional() @IsUUID() entityId?: string;
}
