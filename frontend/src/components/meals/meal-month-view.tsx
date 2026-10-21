//frontend/src/components/meals/meal-month-view.tsx
'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  HandCoins,
  MessageSquareQuote,
  Pencil,
  PiggyBank,
  Receipt,
  Undo2,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/misc';
import { useMealActions } from '@/hooks/use-meals';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { monthLabel } from '@/lib/month';
import { cn } from '@/lib/utils';
import { AnswerDialog, CancelCarryOverDialog, CarryOverDialog, EnvelopeDialog, RequestDialog } from './meal-dialogs';
import type { MealAccountRequest, MealMonthReport, MealRequestStatus } from '@/types/models';

const REQUEST_STATUS: Record<MealRequestStatus, { label: string; tone: 'safety' | 'moss' | 'ink' }> = {
  OPEN: { label: 'En attente de réponse', tone: 'safety' },
  ANSWERED: { label: 'Répondue', tone: 'moss' },
  CLOSED: { label: 'Clôturée', tone: 'ink' },
};

interface MealMonthViewProps {
  projectId: string;
  report: MealMonthReport;
  canManage: boolean; // client ou superadmin : enveloppe, report, demande
  canAnswer: boolean; // superviseur ou superadmin : repondre
  blocked: boolean; // projet suspendu/termine/archive
}

export function MealMonthView({ projectId, report, canManage, canAnswer, blocked }: MealMonthViewProps) {
  const { closeRequest } = useMealActions(projectId);
  const [envelopeOpen, setEnvelopeOpen] = React.useState(false);
  const [carryOpen, setCarryOpen] = React.useState(false);
  const [requestOpen, setRequestOpen] = React.useState(false);
  const [answering, setAnswering] = React.useState<MealAccountRequest | null>(null);
  const [cancelId, setCancelId] = React.useState<string | null>(null);

  const { envelope, amounts, attendance, currency } = report;
  const available = parseFloat(amounts.availableAmount);
  const spent = parseFloat(amounts.spentAmount);
  const pending = parseFloat(amounts.pendingAmount);
  const remaining = parseFloat(amounts.remainingAmount);
  const justified = parseFloat(amounts.justifiedAmount);
  const gap = parseFloat(amounts.gapAmount);
  const carryable = parseFloat(amounts.carryableAmount);
  const editable = canManage && !blocked;

  const pct = (value: number) => (available > 0 ? Math.max(0, Math.min(100, (value / available) * 100)) : 0);
  const spentPct = pct(spent);
  const pendingPct = Math.min(100 - spentPct, pct(pending));
  const remainingPct = Math.max(0, 100 - spentPct - pendingPct);

  if (!envelope) {
    return (
      <>
        <EmptyState
          icon={<UtensilsCrossed className="h-6 w-6" />}
          title={`Aucune enveloppe pour ${monthLabel(report.month)}`}
          description={
            canManage
              ? "Indiquez le montant envoyé ce mois-ci pour l'alimentation des ouvriers et le coût d'un repas : vous verrez ensuite comment il a été utilisé."
              : "Le client n'a pas encore défini l'enveloppe d'alimentation de ce mois."
          }
          action={
            editable ? (
              <Button onClick={() => setEnvelopeOpen(true)}>Définir l&apos;enveloppe du mois</Button>
            ) : undefined
          }
        />
        <RequestsSection {...{ report, canManage: editable || canManage, canAnswer, projectId, onAsk: () => setRequestOpen(true), onAnswer: setAnswering, onClose: (id: string) => closeRequest.mutate(id), closing: closeRequest.isPending }} />
        <EnvelopeDialog open={envelopeOpen} onClose={() => setEnvelopeOpen(false)} projectId={projectId} report={report} />
        <RequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} projectId={projectId} month={report.month} />
        <AnswerDialog open={answering !== null} onClose={() => setAnswering(null)} projectId={projectId} request={answering} />
      </>
    );
  }

  const gapTone = gap > 0 ? 'clay' : 'moss';

  return (
    <div className="space-y-6">
      {/* Resume : combien d'argent, combien utilise */}
      <Card className="overflow-hidden rounded-2xl">
        <div className="bg-gradient-to-br from-[#0B1330] via-[#122057] to-[#1B2E6E] px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/50">Argent disponible pour l&apos;alimentation</p>
              <p className="mt-1 font-ledger text-2xl font-bold text-white sm:text-3xl">{formatMoney(available, currency)}</p>
              <p className="mt-1 text-xs text-white/60">
                Envoyé {formatMoney(amounts.allocatedAmount, currency)}
                {parseFloat(amounts.carriedInAmount) > 0 && ` + reporté ${formatMoney(amounts.carriedInAmount, currency)}`}
                {parseFloat(amounts.carriedOutAmount) > 0 && ` − déjà reporté ailleurs ${formatMoney(amounts.carriedOutAmount, currency)}`}
              </p>
            </div>
            {editable && (
              <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10" onClick={() => setEnvelopeOpen(true)}>
                <Pencil className="h-4 w-4" /> Modifier
              </Button>
            )}
          </div>

          <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[#7FA9D1] transition-all" style={{ width: `${spentPct}%` }} title="Dépensé" />
            <div className="h-full bg-[#E8B944] transition-all" style={{ width: `${pendingPct}%` }} title="En attente de validation" />
            <div className="h-full bg-[#729D81] transition-all" style={{ width: `${remainingPct}%` }} title="Reliquat" />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/70">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#7FA9D1]" /> Dépensé {formatNumber(spent)}</span>
            {pending > 0 && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#E8B944]" /> En attente {formatNumber(pending)}</span>}
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#729D81]" /> Reliquat {formatNumber(remaining)}</span>
          </div>
        </div>
      </Card>

      {!envelope.categoryId && (
        <div className="flex items-start gap-2 rounded-card border border-safety-200 bg-safety-50 px-4 py-3 text-sm text-safety-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Aucune catégorie de dépenses n&apos;est liée à cette enveloppe : les repas payés ne sont pas comptés.
            {editable && ' Modifiez l\'enveloppe pour choisir la catégorie « alimentation ».'}
          </p>
        </div>
      )}

      {/* Presences vs argent */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat
          icon={<CalendarDays className="h-4 w-4" />}
          label="Jours travaillés"
          value={`${attendance.workedDays} / ${attendance.elapsedDays || attendance.daysInMonth}`}
          hint={attendance.unrecordedDays > 0 ? `${attendance.unrecordedDays} jour(s) non renseigné(s)` : 'tous les jours renseignés'}
          tone={attendance.unrecordedDays > 0 ? 'safety' : undefined}
        />
        <MiniStat icon={<Users className="h-4 w-4" />} label="Jours-ouvriers" value={formatNumber(attendance.workerDays)} hint={`× ${formatMoney(amounts.mealUnitCost, currency)} par repas`} />
        <MiniStat icon={<CheckCircle2 className="h-4 w-4" />} label="Justifié par les présences" value={formatMoney(justified, currency)} hint="ce que les jours travaillés devraient coûter" />
        <MiniStat icon={<Receipt className="h-4 w-4" />} label="Repas payés (validés)" value={formatMoney(spent, currency)} hint={pending > 0 ? `+ ${formatMoney(pending, currency)} en attente` : 'dépenses validées'} />
      </div>

      <Card className={cn('rounded-2xl border', gap > 0 ? 'border-clay-200 bg-clay-50/50' : 'border-moss-200 bg-moss-50/50')}>
        <CardContent className="flex items-start gap-3">
          <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', gapTone === 'clay' ? 'bg-clay-100 text-clay-600' : 'bg-moss-100 text-moss-600')}>
            {gap > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className={cn('font-ledger text-lg font-bold', gapTone === 'clay' ? 'text-clay-600' : 'text-moss-600')}>
              {gap > 0 ? '+' : gap < 0 ? '−' : ''}
              {formatMoney(Math.abs(gap), currency)}
            </p>
            <p className="text-sm text-ink-700">
              {gap > 0
                ? `Les repas payés dépassent de ${formatMoney(gap, currency)} ce que les jours travaillés justifient. Vous pouvez demander des comptes au superviseur.`
                : gap < 0
                  ? `Les repas payés sont inférieurs de ${formatMoney(Math.abs(gap), currency)} à ce que les jours travaillés justifient.`
                  : 'Les repas payés correspondent exactement aux jours travaillés.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Reliquat */}
      <Card className="rounded-2xl">
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-full', remaining < 0 ? 'bg-clay-50 text-clay-600' : 'bg-moss-50 text-moss-600')}>
                <PiggyBank className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Reliquat du mois</p>
                <p className={cn('font-ledger text-xl font-bold', remaining < 0 ? 'text-clay-600' : 'text-ink-900')}>{formatMoney(remaining, currency)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => setRequestOpen(true)}>
                  <MessageSquareQuote className="h-4 w-4" /> Demander des comptes
                </Button>
              )}
              {editable && (
                <Button size="sm" onClick={() => setCarryOpen(true)} disabled={carryable <= 0}>
                  <ArrowRightLeft className="h-4 w-4" /> Réutiliser le reliquat
                </Button>
              )}
            </div>
          </div>
          {carryable > 0 && <p className="mt-3 text-xs text-ink-500">Montant reportable sur un mois suivant : {formatMoney(carryable, currency)}.</p>}

          {(report.carryOversIn.length > 0 || report.carryOversOut.length > 0) && (
            <div className="mt-4 space-y-2 border-t border-concrete pt-4">
              {report.carryOversIn.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-concrete bg-paper px-3 py-2.5">
                  <HandCoins className="h-4 w-4 shrink-0 text-moss-600" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium text-ink-800">+ {formatMoney(c.amount, currency)} reportés de {monthLabel(c.fromMonth)}</p>
                    {c.reason && <p className="truncate text-xs text-ink-500">{c.reason}</p>}
                  </div>
                </div>
              ))}
              {report.carryOversOut.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-concrete bg-paper px-3 py-2.5">
                  <ArrowRightLeft className="h-4 w-4 shrink-0 text-blueprint-600" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium text-ink-800">{formatMoney(c.amount, currency)} reportés vers {monthLabel(c.toMonth)}</p>
                    {c.reason && <p className="truncate text-xs text-ink-500">{c.reason}</p>}
                  </div>
                  {editable && (
                    <Button variant="ghost" size="sm" onClick={() => setCancelId(c.id)} title="Annuler ce report">
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RequestsSection {...{ report, canManage, canAnswer, projectId, onAsk: () => setRequestOpen(true), onAnswer: setAnswering, onClose: (id: string) => closeRequest.mutate(id), closing: closeRequest.isPending }} hideAsk />

      <EnvelopeDialog open={envelopeOpen} onClose={() => setEnvelopeOpen(false)} projectId={projectId} report={report} />
      <CarryOverDialog open={carryOpen} onClose={() => setCarryOpen(false)} projectId={projectId} report={report} />
      <CancelCarryOverDialog open={cancelId !== null} onClose={() => setCancelId(null)} projectId={projectId} carryOverId={cancelId} />
      <RequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} projectId={projectId} month={report.month} />
      <AnswerDialog open={answering !== null} onClose={() => setAnswering(null)} projectId={projectId} request={answering} />
    </div>
  );
}

function MiniStat({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint?: string; tone?: 'safety' }) {
  return (
    <Card className="rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
        <span className="text-ink-300">{icon}</span>
      </div>
      <p className="mt-2 break-words font-ledger text-lg font-semibold tracking-tight text-ink-900">{value}</p>
      {hint && <p className={cn('mt-1 text-xs', tone === 'safety' ? 'text-safety-500' : 'text-ink-400')}>{hint}</p>}
    </Card>
  );
}

function RequestsSection({
  report,
  canManage,
  canAnswer,
  onAsk,
  onAnswer,
  onClose,
  closing,
  hideAsk,
}: {
  report: MealMonthReport;
  canManage: boolean;
  canAnswer: boolean;
  projectId: string;
  onAsk: () => void;
  onAnswer: (request: MealAccountRequest) => void;
  onClose: (requestId: string) => void;
  closing: boolean;
  hideAsk?: boolean;
}) {
  if (report.requests.length === 0 && (hideAsk || !canManage)) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink-900">Demandes de comptes</h2>
        {canManage && !hideAsk && (
          <Button variant="outline" size="sm" onClick={onAsk}>
            <MessageSquareQuote className="h-4 w-4" /> Demander des comptes
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {report.requests.map((request) => (
          <Card key={request.id} className="rounded-2xl">
            <CardContent>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusBadge label={REQUEST_STATUS[request.status].label} tone={REQUEST_STATUS[request.status].tone} />
                <span className="text-xs text-ink-400">{formatDate(request.createdAt)}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-ink-800">{request.message}</p>

              {request.response && (
                <div className="mt-3 rounded-xl border border-moss-200 bg-moss-50/60 px-4 py-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-moss-600">Réponse du superviseur{request.answeredAt ? ` · ${formatDate(request.answeredAt)}` : ''}</p>
                  <p className="whitespace-pre-wrap text-sm text-ink-800">{request.response}</p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {canAnswer && request.status === 'OPEN' && (
                  <Button size="sm" onClick={() => onAnswer(request)}>
                    Répondre
                  </Button>
                )}
                {canManage && request.status !== 'CLOSED' && (
                  <Button variant="outline" size="sm" onClick={() => onClose(request.id)} disabled={closing}>
                    Clôturer
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
