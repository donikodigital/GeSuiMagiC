//backend/src/attendance/dto/create-phase.dto.ts
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsMoneyAmount } from '../../common/validators/money-amount.decorator';
import { ISO_DATE_REGEX } from '../../common/utils/month.util';

export class CreatePhaseDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MinLength(2, { message: "Le nom de l'étape est obligatoire." }) @MaxLength(80)
  name!: string;

  /** Budget prevu pour l'etape (client ou superadmin uniquement). */
  @IsOptional() @IsMoneyAmount()
  budgetAmount?: number;

  @IsOptional() @Matches(ISO_DATE_REGEX, { message: 'La date doit être au format AAAA-MM-JJ.' })
  plannedStart?: string;

  @IsOptional() @Matches(ISO_DATE_REGEX, { message: 'La date doit être au format AAAA-MM-JJ.' })
  plannedEnd?: string;
}
