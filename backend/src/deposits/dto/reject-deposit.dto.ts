import { IsString, MinLength } from 'class-validator';

export class RejectDepositDto {
  @IsString() @MinLength(3, { message: 'Un motif de refus est obligatoire (section 14).' })
  reason: string;
}
