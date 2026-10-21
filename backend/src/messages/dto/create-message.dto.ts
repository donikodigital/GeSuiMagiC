//backend/src/messages/dto/create-message.dto.ts
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { MessageType } from '@prisma/client';

/** Cree par un client (demande au superadmin) ou par le superadmin (diffusion). */
export class CreateMessageDto {
  @IsEnum(MessageType)
  type!: MessageType;

  @IsString() @MinLength(2) @MaxLength(200)
  subject!: string;

  @IsString() @MinLength(3) @MaxLength(5000)
  body!: string;

  // Uniquement pour le superadmin : cible un client precis. Laisser vide + type=BROADCAST pour diffuser a tous.
  @IsOptional() @IsUUID()
  recipientId?: string;

  @IsOptional() @IsIn(['Deposit', 'Expense'])
  relatedEntityType?: string;

  @IsOptional() @IsUUID()
  relatedEntityId?: string;
}
