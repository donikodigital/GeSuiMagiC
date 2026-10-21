//backend/src/auth/dto/login.dto.ts
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  // Plafond : evite qu'un mot de passe de plusieurs Mo monopolise le CPU (argon2) a chaque tentative.
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}
