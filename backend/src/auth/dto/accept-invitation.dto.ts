//backend/src/auth/dto/accept-invitation.dto.ts
import { IsString, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caracteres.' })
  password: string;
}
