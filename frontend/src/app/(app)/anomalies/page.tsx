// frontend/src/app/(app)/anomalies/page.tsx - v2.0
'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { anomaliesService } from '@/services/anomalies.service';
import { PageHeader } from '@/components/shared/page-header';
import { AnomalyCard, CATEGORY_LABELS } from '@/components/anomalies/anomaly-card';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, Textarea } from '@/components/ui/input';
import { PageSpinner, ErrorState, EmptyState } from '@/components/ui/misc';
import { ApiError } from '@/lib/api-client';
import type { Anomaly, AnomalyStatus } from '@/types/models';
import { RequireRole } from '@/components/shared/require-role';

function AnomaliesPageContent() {
  const [statusFilter, setStatusFilter] = React.useState<AnomalyStatus | ''>('');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Anomaly | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['anomalies', 'all', page, statusFilter],
    queryFn: () => anomaliesService.listAll(page, 20, statusFilter || undefined),
  });

  return (
    <div>
      <PageHeader title="Anomalies signalees" description="Signalements des clients necessitant une investigation." />

      <div className="mb-4">
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as AnomalyStatus | '');
            setPage(1);
          }}
          className="w-full sm:w-56"
        >
          <option value="">Tous les statuts</option>
          <option value="OPEN">Ouverts</option>
          <option value="INVESTIGATING">En investigation</option>
          <option value="RESOLVED">Resolus</option>
          <option value="REJECTED">Rejetes</option>
        </Select>
      </div>

      {isError ? (
        <ErrorState message="Impossible de charger les anomalies." />
      ) : isLoading ? (
        <PageSpinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState title="Aucune anomalie" description="Aucun client n'a signale d'anomalie pour le moment." />
      ) : (
        <>
          <div className="space-y-3">
            {(data?.items ?? []).map((a) => (
              <AnomalyCard key={a.id} anomaly={a} onClick={() => setSelected(a)} />
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

      {selected && <AnomalyResolveDialog anomaly={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AnomalyResolveDialog({ anomaly, onClose }: { anomaly: Anomaly; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<AnomalyStatus>(anomaly.status);
  const [note, setNote] = React.useState(anomaly.resolutionNote ?? '');

  const mutation = useMutation({
    mutationFn: () => anomaliesService.updateStatus(anomaly.id, status, note || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anomalies'] });
      toast.success('Signalement mis a jour.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Mise a jour impossible.'),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Traiter le signalement"
      description={`${CATEGORY_LABELS[anomaly.category] ?? anomaly.category} - ${anomaly.project?.name ?? ''}`}
    >
      <div className="space-y-4">
        <p className="rounded-md bg-paper px-3 py-2.5 text-sm text-ink-700">{anomaly.description}</p>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">Statut</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as AnomalyStatus)}>
            <option value="OPEN">Ouvert</option>
            <option value="INVESTIGATING">En investigation</option>
            <option value="RESOLVED">Resolu</option>
            <option value="REJECTED">Rejete</option>
          </Select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">Reponse au client</label>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Fermer
        </Button>
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
          Enregistrer
        </Button>
      </div>
    </Dialog>
  );
}

export default function AnomaliesPage() {
  return (
    <RequireRole roles={['SUPERADMIN']}>
      <AnomaliesPageContent />
    </RequireRole>
  );
}