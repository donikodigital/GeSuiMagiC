// frontend/src/components/expenses/expense-card.tsx - v1.1
// Retrait de "truncate" sur le libelle (ExpenseCard) - il coupait le texte
// avec "..." des qu'il depassait une ligne (visible sur "Dépenses a...",
// "Avance sur ..."). Le libelle s'enroule desormais sur plusieurs lignes
// (line-clamp-2 pour eviter qu'un libelle tres long ne pousse trop la
// carte en hauteur). Montant et badge passes en shrink-0 pour ne jamais
// se faire ecraser par le texte qui grandit.

'use client';

import { ChevronRight, ReceiptText } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { expenseStatusMeta, formatDate, formatMoney } from '@/lib/format';
import type { Expense } from '@/types/models';

const TONE_ICON_BG: Record<string, string> = {
  moss: 'bg-moss-50 text-moss-600',
  safety: 'bg-safety-50 text-safety-500',
  clay: 'bg-clay-50 text-clay-600',
  ink: 'bg-ink-50 text-ink-600',
  blueprint: 'bg-blueprint-50 text-blueprint-700',
};

export function ExpenseCard({ expense, currency, onClick }: { expense: Expense; currency: string; onClick: () => void }) {
  const tone = expenseStatusMeta[expense.status].tone;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-card border border-concrete bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-blueprint-200 hover:shadow-md active:translate-y-0"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONE_ICON_BG[tone]}`}>
        <ReceiptText className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <p className="line-clamp-2 font-medium text-ink-900">{expense.label}</p>
          <StatusBadge label={expenseStatusMeta[expense.status].label} tone={tone} className="shrink-0" />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-400">
          <span>{formatDate(expense.date)}</span>
          {expense.category?.name && (
            <>
              <span className="text-ink-300">·</span>
              <span>{expense.category.name}</span>
            </>
          )}
        </div>
      </div>

      <p className="shrink-0 font-ledger text-sm font-semibold text-ink-900">{formatMoney(expense.total, currency)}</p>

      <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blueprint-500" />
    </button>
  );
}