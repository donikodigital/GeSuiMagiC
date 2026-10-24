//backend/src/attendance/dto/update-phase.dto.ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsMoneyAmount } from '../../common/validators/money-amount.decorator';
import { ISO_DATE_REGEX } from '../../common/utils/month.util';

export class UpdatePhaseDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MinLength(2) @MaxLength(80)
  name?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  /** Budget prevu de l'etape (client ou superadmin). null = retirer le budget. */
  @IsOptional() @IsMoneyAmount()
  budgetAmount?: number | null;

  /** Planning previsionnel (client, superadmin ou conducteur de travaux). null = retirer la date. */
  @IsOptional() @Matches(ISO_DATE_REGEX, { message: 'La date doit être au format AAAA-MM-JJ.' })
  plannedStart?: string | null;

  @IsOptional() @Matches(ISO_DATE_REGEX, { message: 'La date doit être au format AAAA-MM-JJ.' })
  plannedEnd?: string | null;
}
