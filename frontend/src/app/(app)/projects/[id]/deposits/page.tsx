// frontend/src/app/(app)/projects/[id]/deposits/page.tsx - v2.1
// Harmonisation de la modale de detail avec le style de
// PendingDepositActionDialog (raccourci du tableau de bord superviseur) :
// bouton "Valider le depot" en pleine largeur au-dessus, boutons
// secondaires (Refuser / Voir le detail complet / Fermer) en grille en
// dessous au lieu d'un flex-wrap justify-end. Le nombre de colonnes de la
// grille secondaire s'adapte au nombre de boutons realement affiches (1 a
// 3 selon le role). Aucun changement de logique/mutations.

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useDeposits, useApproveDeposit, useRejectDeposit } from '@/hooks/use-deposits';
import { useAuth } from '@/hooks/use-auth';
import { DepositCard } from '@/components/deposits/deposit-card';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { PageSpinner, ErrorState, EmptyState } from '@/components/ui/misc';
import { depositStatusMeta, formatDateTime, formatMoney, paymentMethodLabels } from '@/lib/format';
import type { Deposit, DepositStatus } from '@/types/models';

const GRID_COLS_CLASS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };

export default function ProjectDepositsPage() {
  const params = useParams<{ id: string }>();
  const { isClient, isSuperadmin, isSupervisor } = useAuth();
  const [status, setStatus] = React.useState<DepositStatus | ''>('');
  const [page, setPage] = React.useState(1);
  const [rejectTarget, setRejectTarget] = React.useState<Deposit | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<Deposit | null>(null);

  const { data, isLoading, isError } = useDeposits(params.id, { page, limit: 20, status: status || undefined });
  const approveMutation = useApproveDeposit(params.id);
  const rejectMutation = useRejectDeposit(params.id);

  const canApprove = !!detailTarget && isSupervisor && detailTarget.status === 'PENDING';
  const canViewFull = isClient || isSuperadmin;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as DepositStatus | '');
            setPage(1);
          }}
          className="w-full sm:w-48"
        >
          <option value="">Tous les statuts</option>
          <option value="PENDING">En attente</option>
          <option value="APPROVED">Validés</option>
          <option value="REJECTED">Refusés</option>
        </Select>

        {isClient && (
          <Link href={`/projects/${params.id}/deposits/new`}>
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4" /> Nouveau dépôt
            </Button>
          </Link>
        )}
      </div>

      {isError ? (
        <ErrorState message="Impossible de charger les dépôts." />
      ) : isLoading ? (
        <PageSpinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title="Aucun dépôt"
          description={isClient ? 'Enregistrez un dépôt pour alimenter le portefeuille du chantier.' : 'Aucun dépôt enregistré pour ce chantier.'}
        />
      ) : (
        <>
          <div className="space-y-3">
            {(data?.items ?? []).map((deposit) => (
              <DepositCard key={deposit.id} deposit={deposit} onClick={() => setDetailTarget(deposit)} />
            ))}
          </div>

          {data?.meta && data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-ink-400">
                {data.meta.total} resultat{data.meta.total > 1 ? 's' : ''} - page {data.meta.page} sur {data.meta.totalPages}
              </p>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" disabled={data.meta.page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.meta.page >= data.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ReasonDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={(reason) => {
          if (rejectTarget) rejectMutation.mutate({ id: rejectTarget.id, reason }, { onSuccess: () => setRejectTarget(null) });
        }}
        title="Réfuser ce dépôt"
        description="Un motif de réfus est obligatoire et sera communiqué au client."
        confirmLabel="Réfuser le dépôt"
        danger
        isLoading={rejectMutation.isPending}
      />

      {detailTarget && (
        <Dialog
          open
          onClose={() => setDetailTarget(null)}
          title={formatMoney(detailTarget.amount, detailTarget.currency)}
          description={detailTarget.motif || undefined}
        >
          <dl className="space-y-3 text-sm">
            <Field label="Date" value={formatDateTime(detailTarget.date)} />
            <Field label="Mode de versement" value={paymentMethodLabels[detailTarget.paymentMethod]} />
            {detailTarget.supervisor && (
              <Field label="Superviseur bénéficiaire" value={`${detailTarget.supervisor.firstName} ${detailTarget.supervisor.lastName}`} />
            )}
            <Field label="Référence" value={detailTarget.reference || '-'} />
            {detailTarget.observation && <Field label="Observation" value={detailTarget.observation} />}
            <Field label="Statut" value={depositStatusMeta[detailTarget.status].label} />
          </dl>

          {(() => {
            const secondary: { key: string; node: React.ReactNode }[] = [];
            if (canApprove) {
              secondary.push({
                key: 'reject',
                node: (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRejectTarget(detailTarget);
                      setDetailTarget(null);
                    }}
                  >
                    <X className="h-4 w-4" /> Refuser
                  </Button>
                ),
              });
            }
            if (canViewFull) {
              secondary.push({
                key: 'full',
                node: (
                  <Link href={`/projects/${params.id}/deposits/${detailTarget.id}`} className="w-full">
                    <Button variant="outline" className="w-full">
                      Voir le detail complet
                    </Button>
                  </Link>
                ),
              });
            }
            secondary.push({
              key: 'close',
              node: (
                <Button variant="outline" onClick={() => setDetailTarget(null)}>
                  Fermer
                </Button>
              ),
            });

            return (
              <div className="mt-5 space-y-2 border-t border-concrete pt-4">
                {canApprove && (
                  <Button
                    className="w-full"
                    onClick={() => approveMutation.mutate(detailTarget.id, { onSuccess: () => setDetailTarget(null) })}
                    loading={approveMutation.isPending}
                  >
                    <Check className="h-4 w-4" /> Valider le dépôt
                  </Button>
                )}
                <div className={`grid gap-2 ${GRID_COLS_CLASS[secondary.length] ?? 'grid-cols-1'}`}>
                  {secondary.map((s) => (
                    <React.Fragment key={s.key}>{s.node}</React.Fragment>
                  ))}
                </div>
              </div>
            );
          })()}
        </Dialog>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-concrete-light pb-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 break-words text-ink-800">{value}</dd>
    </div>
  );
}