//frontend/src/components/site/documents/report-section.tsx
'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState, PageSpinner } from '@/components/ui/misc';
import { ProgressBar } from '@/components/site/progress-bar';
import { SectionHeader } from '@/components/site/section-header';
import { useMonthlyReport, errorText } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { formatMoney } from '@/lib/format';
import { addMonths, currentMonth, monthLabel } from '@/lib/month';
import { formatDay, scheduleStatusMeta } from '@/lib/site-format';

/** Rapport mensuel : finances, presences, avancement, qualite — consultable ici et envoye au client chaque mois. */
export function ReportSection({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [month, setMonth] = React.useState(currentMonth());
  const { data: report, isLoading, isError } = useMonthlyReport(projectId, month);
  const [downloading, setDownloading] = React.useState(false);
  const isCurrent = month >= currentMonth();

  const download = async () => {
    setDownloading(true);
    try {
      await siteService.monthlyReportPdf(projectId, month, projectName.replace(/[^\p{L}\p{N}]+/gu, '-'));
    } catch (error) {
      toast.error(errorText(error, 'Impossible de télécharger le rapport.'));
    } finally {
      setDownloading(false);
    }
  };
  const money = (v: string | number) => formatMoney(v, report?.currency ?? 'GNF');

  return (
    <div className="space-y-4">
      <SectionHeader title="Rapport mensuel" description="Une synthèse claire du mois : argent, présences, avancement, qualité. Le client la reçoit automatiquement en début de mois." />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-2xl bg-concrete-light p-1">
          <Button size="sm" variant="ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mois précédent">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold capitalize text-ink-800">{monthLabel(month)}</span>
          <Button size="sm" variant="ghost" onClick={() => setMonth(addMonths(month, 1))} disabled={isCurrent} aria-label="Mois suivant">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={download} loading={downloading} disabled={!report}>
          <Download className="h-4 w-4" /> Télécharger le PDF
        </Button>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : isError || !report ? (
        <ErrorState message="Impossible de générer le rapport de ce mois." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="rounded-2xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Dépôts du mois</p>
              <p className="mt-1 font-ledger text-xl font-bold text-moss-600">{money(report.finance.depositsAmount)}</p>
              <p className="text-xs text-ink-400">{report.finance.depositsCount} dépôt(s)</p>
            </Card>
            <Card className="rounded-2xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Dépenses du mois</p>
              <p className="mt-1 font-ledger text-xl font-bold text-ink-900">{money(report.finance.expensesAmount)}</p>
              <p className="text-xs text-ink-400">
                {report.finance.expensesCount} dépense(s){report.finance.pendingExpenses > 0 ? ` · ${report.finance.pendingExpenses} à valider` : ''}
              </p>
            </Card>
            <Card className="rounded-2xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Solde disponible</p>
              <p className="mt-1 font-ledger text-xl font-bold text-blueprint-700">{money(report.finance.balance)}</p>
              <p className="text-xs text-ink-400">Déposé {money(report.finance.totalDeposited)}</p>
            </Card>
            <Card className="rounded-2xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Budget consommé</p>
              <p className="mt-1 font-ledger text-xl font-bold text-ink-900">{report.finance.budgetConsumedPercent.toFixed(0)} %</p>
              <ProgressBar className="mt-1.5 h-1.5" value={Math.min(report.finance.budgetConsumedPercent, 100)} tone={report.finance.budgetConsumedPercent > 100 ? 'clay' : 'blueprint'} />
            </Card>
          </div>

          {report.finance.topCategories.length > 0 && (
            <Card className="rounded-2xl p-4">
              <h3 className="font-display text-sm font-semibold text-ink-800">Principaux postes de dépense</h3>
              <ul className="mt-3 space-y-2.5">
                {report.finance.topCategories.map((c) => {
                  const total = Number(report.finance.expensesAmount) || 1;
                  return (
                    <li key={c.name}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-ink-700">{c.name}</span>
                        <span className="shrink-0 font-ledger text-xs text-ink-600">{money(c.amount)}</span>
                      </div>
                      <ProgressBar className="mt-1 h-1.5" value={Math.min((Number(c.amount) / total) * 100, 100)} tone="blueprint" />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="rounded-2xl p-4">
              <h3 className="font-display text-sm font-semibold text-ink-800">Présences sur le chantier</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-ink-400">Jours travaillés</dt>
                  <dd className="font-ledger font-semibold text-ink-900">{report.attendance.workedDays}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-400">Jours-ouvriers</dt>
                  <dd className="font-ledger font-semibold text-ink-900">{report.attendance.workerDays}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-400">Jours non renseignés</dt>
                  <dd className="font-ledger font-semibold text-ink-900">{report.attendance.unrecordedDays}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-400">Taux d&apos;activité</dt>
                  <dd className="font-ledger font-semibold text-ink-900">{report.attendance.attendanceRate.toFixed(0)} %</dd>
                </div>
              </dl>
              {report.attendance.stopReasons.length > 0 && (
                <p className="mt-3 border-t border-concrete pt-2.5 text-xs text-ink-500">
                  Arrêts : {report.attendance.stopReasons.map((r) => `${r.label} (${r.days} j)`).join(' · ')}
                </p>
              )}
            </Card>

            <Card className="rounded-2xl p-4">
              <h3 className="font-display text-sm font-semibold text-ink-800">Avancement</h3>
              <p className="mt-2 font-ledger text-2xl font-bold text-ink-900">{report.progress.percent.toFixed(0)} %</p>
              <ProgressBar className="mt-1.5 h-2" value={report.progress.percent} tone="moss" />
              <p className="mt-2 text-xs text-ink-500">
                {report.progress.delayDays > 0 ? `Retard estimé : ${report.progress.delayDays} jour(s)` : 'Dans les délais'}
                {report.progress.projectedEndDate ? ` · fin prévue le ${formatDay(report.progress.projectedEndDate)}` : ''}
              </p>
              {report.progress.phases.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-concrete pt-2.5">
                  {report.progress.phases.map((p) => (
                    <li key={p.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate text-ink-700">{p.name}</span>
                      <span className="shrink-0 font-ledger text-ink-500">
                        {p.percent.toFixed(0)} % · {scheduleStatusMeta[p.status].label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="rounded-2xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Réserves</p>
              <p className="mt-1 font-ledger text-lg font-bold text-ink-900">{report.quality.openSnags} ouverte(s)</p>
              <p className="text-xs text-ink-400">{report.quality.snagsRaised} signalée(s) ce mois</p>
            </Card>
            <Card className="rounded-2xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Marchés de sous-traitance</p>
              <p className="mt-1 font-ledger text-lg font-bold text-ink-900">{report.contracts.count}</p>
              <p className="text-xs text-ink-400">{money(report.contracts.amount)}</p>
            </Card>
            <Card className="rounded-2xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Avenants validés</p>
              <p className="mt-1 font-ledger text-lg font-bold text-ink-900">{report.changeOrders.length}</p>
              <p className="truncate text-xs text-ink-400">{report.changeOrders.map((c) => `n°${c.number}`).join(', ') || '—'}</p>
            </Card>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-ink-400">
            <FileText className="h-3.5 w-3.5" /> Généré le {formatDay(report.generatedAt)}
          </p>
        </div>
      )}
    </div>
  );
}
