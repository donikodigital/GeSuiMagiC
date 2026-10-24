//frontend/src/components/site/progress/phase-cost-cards.tsx
'use client';

import { AlertTriangle, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { ProgressBar } from '@/components/site/progress-bar';
import { Fact } from '@/components/site/section-header';
import { formatMoney } from '@/lib/format';
import { toNum } from '@/lib/site-format';
import type { PhaseCosts } from '@/types/site';

/** Cout par etape : budget, depense validee, en attente, engage, reste et cout final prevu. */
export function PhaseCostCards({ costs }: { costs: PhaseCosts }) {
  const money = (v: string | number) => formatMoney(v, costs.currency);
  const active = costs.phases.filter((p) => p.isActive);
  const unallocatedBudget = toNum(costs.totals.unallocatedBudget);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Budget des étapes" value={money(costs.totals.phaseBudgets)} hint={`sur ${money(costs.projectBudget)} de budget total`} />
        <StatCard label="Dépensé (validé)" value={money(costs.totals.spent)} tone="moss" hint={toNum(costs.totals.pending) > 0 ? `+ ${money(costs.totals.pending)} en attente` : undefined} />
        <StatCard label="Engagé (marchés)" value={money(costs.totals.committed)} hint="sous-traitance signée" />
        <StatCard label={unallocatedBudget < 0 ? 'Budget dépassé' : 'Budget non réparti'} value={money(Math.abs(unallocatedBudget))} tone={unallocatedBudget < 0 ? 'clay' : 'default'} hint={unallocatedBudget < 0 ? 'les étapes dépassent le budget du projet' : 'à répartir entre les étapes'} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {active.map((phase, i) => {
          const used = phase.usedPercent ?? 0;
          const tone = phase.overBudget ? 'clay' : used >= 85 ? 'safety' : 'moss';
          return (
            <Card key={phase.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-medium text-ink-900">{phase.name}</p>
                {phase.overBudget ? <StatusBadge label="Budget dépassé" tone="clay" /> : phase.forecastOverBudget ? <StatusBadge label="Dépassement prévu" tone="safety" /> : phase.budgetAmount ? <StatusBadge label="Dans le budget" tone="moss" /> : <StatusBadge label="Sans budget" tone="ink" />}
              </div>
              {phase.budgetAmount ? (
                <>
                  <div className="mt-3 flex items-end justify-between">
                    <p className="font-ledger text-xl font-bold text-ink-900">{money(phase.spent)}</p>
                    <p className="text-xs text-ink-400">sur {money(phase.budgetAmount)}</p>
                  </div>
                  <ProgressBar className="mt-2" value={Math.min(100, used)} tone={tone} marker={phase.progressPercent} />
                  <p className="mt-1 text-[11px] text-ink-400">{used} % du budget consommé · repère noir = avancement ({phase.progressPercent} %)</p>
                </>
              ) : (
                <p className="mt-3 font-ledger text-xl font-bold text-ink-900">{money(phase.spent)}</p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-concrete pt-3">
                <Fact label="En attente" value={money(phase.pending)} />
                <Fact label="Engagé" value={money(phase.committed)} />
                <Fact label="Reste" value={phase.remaining ? money(phase.remaining) : '—'} />
                <Fact label="Coût final prévu" value={phase.forecast ? money(phase.forecast) : phase.progressPercent < 10 ? 'dès 10 % d’avancement' : '—'} />
              </div>
              {phase.forecastOverBudget && phase.forecastVariance && (
                <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-safety-50 px-3 py-2 text-xs text-safety-500">
                  <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Au rythme actuel, cette étape dépassera son budget de {money(Math.abs(toNum(phase.forecastVariance)))}.
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {(toNum(costs.unallocated.spent) > 0 || toNum(costs.unallocated.pending) > 0) && (
        <Card className="flex items-start gap-3 rounded-2xl border-safety-200 bg-safety-50/40 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-safety-500" />
          <div className="text-sm text-ink-700">
            <p className="font-medium text-ink-900">Dépenses sans étape : {money(costs.unallocated.spent)}{toNum(costs.unallocated.pending) > 0 ? ` (+ ${money(costs.unallocated.pending)} en attente)` : ''}</p>
            <p className="mt-0.5 text-ink-500">Rattachez-les à une étape depuis la fiche de la dépense pour que le coût par étape soit complet.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
