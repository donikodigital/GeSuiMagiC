//backend/src/auth/dto/change-password.dto.ts
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caracteres.' })
  @MaxLength(128, { message: 'Le mot de passe ne doit pas depasser 128 caracteres.' })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.' })
  newPassword: string;
}
