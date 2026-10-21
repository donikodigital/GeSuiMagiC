//backend/src/attachments/dto/attachment-query.dto.ts
import { IsOptional, IsUUID } from 'class-validator';

export class AttachmentQueryDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() depositId?: string;
  @IsOptional() @IsUUID() expenseId?: string;
}
