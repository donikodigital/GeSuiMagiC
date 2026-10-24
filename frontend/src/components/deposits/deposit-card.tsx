//frontend/src/components/deposits/deposit-card.tsx
// Carte de depot : libelle sur 2 lignes maximum, montant/badge/icone sans compression, et mention du montant
// envoye lorsque le depot vient de l'etranger.

'use client';

import { Banknote, ChevronRight, FileText, Landmark, MoreHorizontal, Smartphone } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { depositStatusMeta, formatMoney, paymentMethodLabels } from '@/lib/format';
import type { Deposit } from '@/types/models';

const METHOD_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  CASH: Banknote,
  BANK_TRANSFER: Landmark,
  MOBILE_MONEY: Smartphone,
  CHECK: FileText,
  OTHER: MoreHorizontal,
};

export function DepositCard({ deposit, onClick }: { deposit: Deposit; onClick: () => void }) {
  const tone = depositStatusMeta[deposit.status].tone;
  const Icon = METHOD_ICON[deposit.paymentMethod] ?? MoreHorizontal;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-card border border-concrete bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-blueprint-200 hover:shadow-md active:translate-y-0"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-moss-50 text-moss-600">
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <p className="line-clamp-2 font-medium text-ink-900">{deposit.motif || paymentMethodLabels[deposit.paymentMethod]}</p>
          <StatusBadge label={depositStatusMeta[deposit.status].label} tone={tone} className="shrink-0" />
        </div>
        <p className="mt-0.5 text-xs text-ink-400">{new Date(deposit.date).toLocaleDateString('fr-FR')}</p>
        {deposit.originalAmount && deposit.originalCurrency && (
          <p className="mt-0.5 text-xs text-blueprint-600">
            Envoyé : {formatMoney(deposit.originalAmount, deposit.originalCurrency)}
            {deposit.exchangeRate ? ` · taux ${Number(deposit.exchangeRate).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}` : ''}
          </p>
        )}
      </div>

      <p className="shrink-0 font-ledger text-sm font-semibold text-ink-900">{formatMoney(deposit.amount, deposit.currency)}</p>

      <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blueprint-500" />
    </button>
  );
}