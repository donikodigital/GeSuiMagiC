//frontend/src/components/site/currency-summary.tsx
'use client';

import { Globe2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useCurrencySummary } from '@/hooks/use-site';
import { formatMoney } from '@/lib/format';

/** Resume des depots envoyes de l'etranger : montant envoye, frais, taux reel moyen (frais compris) par devise. */
export function CurrencySummaryCards({ projectId }: { projectId: string }) {
  const { data } = useCurrencySummary(projectId);
  if (!data || data.currencies.length === 0) return null;
  const project = data.projectCurrency ?? 'GNF';

  return (
    <div className="mb-5 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
        <Globe2 className="h-3.5 w-3.5" /> Dépôts envoyés de l&apos;étranger
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.currencies.map((c, i) => (
          <Card key={c.originalCurrency} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in rounded-2xl p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-base font-semibold text-ink-900">{c.originalCurrency}</p>
              <p className="text-xs text-ink-400">{c.count} dépôt(s)</p>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Envoyé</dt>
                <dd className="font-ledger font-semibold text-ink-900">{formatMoney(c.sentOriginal, c.originalCurrency)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Frais de transfert</dt>
                <dd className="font-ledger text-ink-700">{formatMoney(c.fees, c.originalCurrency)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Crédité</dt>
                <dd className="font-ledger font-semibold text-moss-600">{formatMoney(c.credited, project)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-concrete pt-1.5">
                <dt className="text-ink-500">Taux réel moyen</dt>
                <dd className="font-ledger font-semibold text-ink-900">{Number(c.averageEffectiveRate).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</dd>
              </div>
              <div className="flex justify-between gap-2 text-xs text-ink-400">
                <dt>Taux min / max</dt>
                <dd className="font-ledger">
                  {Number(c.minRate).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} – {Number(c.maxRate).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
                </dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}
