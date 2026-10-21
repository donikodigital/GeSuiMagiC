//backend/src/attendance/dto/work-day-query.dto.ts
import { Matches } from 'class-validator';
import { MONTH_REGEX } from '../../common/utils/month.util';

export class WorkDayQueryDto {
  @Matches(MONTH_REGEX, { message: 'Le mois doit etre au format AAAA-MM (ex: 2026-10).' })
  month!: string;
}
