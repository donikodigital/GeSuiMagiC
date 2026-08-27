// backend/src/messages/dto/message-query.dto.ts
import { IsEnum, IsOptional } from 'class-validator';
import { MessageStatus, MessageType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class MessageQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(MessageStatus) status?: MessageStatus;
  @IsOptional() @IsEnum(MessageType) type?: MessageType;
}