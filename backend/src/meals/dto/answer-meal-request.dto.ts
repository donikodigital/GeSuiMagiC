//backend/src/meals/dto/answer-meal-request.dto.ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnswerMealRequestDto {
  @IsString() @MinLength(2, { message: 'La reponse est obligatoire.' }) @MaxLength(2000)
  response!: string;
}
