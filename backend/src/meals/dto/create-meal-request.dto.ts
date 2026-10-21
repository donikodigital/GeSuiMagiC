//backend/src/meals/dto/create-meal-request.dto.ts
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Demande de comptes du client au superviseur sur l'alimentation d'un mois. */
export class CreateMealRequestDto {
  @IsString() @MinLength(5, { message: 'Precisez votre demande (5 caracteres minimum).' }) @MaxLength(2000)
  message!: string;
}
