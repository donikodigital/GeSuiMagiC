//backend/src/messages/dto/reply-message.dto.ts
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ReplyMessageDto {
  @IsString() @MinLength(1) @MaxLength(5000)
  body!: string;

  // Superadmin uniquement : repondre en prive a un client precis dans un fil de diffusion.
  // Ignore la valeur pour les autres roles (ils repondent toujours a l'equipe).
  @IsOptional() @IsUUID()
  recipientId?: string;
}
