// backend/src/messages/dto/create-message.dto.ts
import { IsEnum, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { MessageType } from '@prisma/client';

/** Cree par un client (demande au superadmin) ou par le superadmin (diffusion). */
export class CreateMessageDto {
  @IsEnum(MessageType)
  type!: MessageType;

  @IsString() @MinLength(2)
  subject!: string;

  @IsString() @MinLength(3)
  body!: string;

  // Uniquement pour le superadmin : cible un client precis. Laisser vide + type=BROADCAST pour diffuser a tous.
  @IsOptional() @IsString()
  recipientId?: string;

  @IsOptional() @IsIn(['Deposit', 'Expense'])
  relatedEntityType?: string;

  @IsOptional() @IsString()
  relatedEntityId?: string;
}