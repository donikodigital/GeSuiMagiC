// backend/src/messages/dto/reply-message.dto.ts
import { IsString, MinLength } from 'class-validator';

export class ReplyMessageDto {
  @IsString() @MinLength(1)
  body!: string;
}