//backend/src/meals/dto/create-carry-over.dto.ts
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MONTH_REGEX } from '../../common/utils/month.util';
import { IsMoneyAmount } from '../../common/validators/money-amount.decorator';

/** Report valide par le client d'un reliquat vers un mois suivant. */
export class CreateCarryOverDto {
  @Matches(MONTH_REGEX, { message: 'Le mois de destination doit etre au format AAAA-MM.' })
  toMonth!: string;

  @IsMoneyAmount()
  amount!: number;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}
