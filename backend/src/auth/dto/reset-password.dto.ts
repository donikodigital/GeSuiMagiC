//backend/src/auth/dto/reset-password.dto.ts
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caracteres.' })
  @MaxLength(128, { message: 'Le mot de passe ne doit pas depasser 128 caracteres.' })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.' })
  password: string;
}
