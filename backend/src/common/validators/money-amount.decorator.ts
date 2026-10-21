//backend/src/common/validators/money-amount.decorator.ts
import { applyDecorators } from '@nestjs/common';
import { IsNumber, IsPositive, Max } from 'class-validator';

/**
 * Plafond d'un montant saisi : 10 000 milliards. Au-dela, un nombre JavaScript
 * perd de la precision (et la colonne Decimal(18,2) deborderait en erreur 500).
 */
export const MAX_INPUT_AMOUNT = 9_999_999_999_999.99;

/** Montant monetaire saisi : nombre fini, strictement positif, 2 decimales max, plafonne. */
export function IsMoneyAmount() {
  return applyDecorators(
    IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }, { message: 'Le montant doit etre un nombre avec 2 decimales maximum.' }),
    IsPositive({ message: 'Le montant doit etre strictement positif.' }),
    Max(MAX_INPUT_AMOUNT, { message: 'Le montant est trop eleve.' }),
  );
}
