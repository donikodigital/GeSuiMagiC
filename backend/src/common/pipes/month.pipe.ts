//backend/src/common/pipes/month.pipe.ts
import { Injectable, PipeTransform } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { isValidMonth } from '../utils/month.util';

/** Valide un parametre de route "AAAA-MM" (400 INVALID_MONTH sinon). */
@Injectable()
export class MonthPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidMonth(value)) throw AppException.badRequest('INVALID_MONTH', 'Le mois doit etre au format AAAA-MM (ex: 2026-10).');
    return value;
  }
}
