import { IsString, MinLength } from 'class-validator';

export class RejectExpenseDto {
  @IsString() @MinLength(3)
  reason: string;
}
