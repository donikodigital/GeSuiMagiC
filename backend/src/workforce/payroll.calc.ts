//backend/src/workforce/payroll.calc.ts
import { Prisma } from '@prisma/client';
import { roundMoney, toDecimal } from '../common/utils/money.util';

type Num = Prisma.Decimal | number | string;

export interface PayLineInput {
  /** Jours travailles sur la periode (somme des fractions de presence). */
  daysWorked: Num;
  dailyRate: Num;
  /** Montant forfaitaire d'un marche a la tache : remplace jours x taux. */
  taskAmount?: Num | null;
  /** Avance restant a regulariser pour cet ouvrier. */
  advanceOutstanding: Num;
  /** Retenue d'avance voulue (par defaut : tout ce qui est du, dans la limite du brut). */
  advanceRequested?: Num | null;
}

export interface PayLineResult {
  gross: Prisma.Decimal;
  advance: Prisma.Decimal;
  net: Prisma.Decimal;
}

export function computePayLine(input: PayLineInput): PayLineResult & { error?: 'ADVANCE_TOO_HIGH' } {
  const gross = roundMoney(input.taskAmount != null ? toDecimal(input.taskAmount) : toDecimal(input.daysWorked).mul(toDecimal(input.dailyRate)));
  const ceiling = Prisma.Decimal.min(toDecimal(input.advanceOutstanding), gross);
  const wanted = input.advanceRequested != null ? roundMoney(input.advanceRequested) : ceiling;
  if (wanted.greaterThan(ceiling)) return { gross, advance: ceiling, net: gross.sub(ceiling), error: 'ADVANCE_TOO_HIGH' };
  return { gross, advance: wanted, net: gross.sub(wanted) };
}

export function sumPayLines(lines: Array<{ grossAmount: Num; advanceDeducted: Num; netAmount: Num }>) {
  const add = (pick: (l: (typeof lines)[number]) => Num) => roundMoney(lines.reduce((s, l) => s.add(toDecimal(pick(l))), new Prisma.Decimal(0)));
  return { totalGross: add((l) => l.grossAmount), totalAdvance: add((l) => l.advanceDeducted), totalNet: add((l) => l.netAmount) };
}

/** Deux periodes [debut, fin] (bornes incluses) se chevauchent-elles ? */
export function periodsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

/** Solde d'avance d'un ouvrier : avances donnees moins avances deja regularisees par une paie valable. */
export function advanceBalance(given: Num, deducted: Num): Prisma.Decimal {
  const balance = toDecimal(given).sub(toDecimal(deducted));
  return balance.lessThan(0) ? new Prisma.Decimal(0) : balance;
}
