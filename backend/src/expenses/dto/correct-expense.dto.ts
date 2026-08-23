import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

export class CorrectExpenseDto {
  @IsNumber() @IsPositive()
  newTotal: number;

  @IsString() @MinLength(3)
  reason: string;
}
