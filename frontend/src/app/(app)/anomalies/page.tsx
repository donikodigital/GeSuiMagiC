'use client';

import * as React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { anomaliesService } from '@/services/anomalies.service';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/misc';
import { anomalyStatusMeta, formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import type { Anomaly, AnomalyStatus } from '@/types/models';
import { RequireRole } from '@/components/shared/require-role';

const CATEGORY_LABELS: Record<string, string> = {
  depense_inconnue: 'Depense inconnue',
  montant_incorrect: 'Montant incorrect',
  doublon: 'Doublon',
  justificatif_absent: 'Justificatif absent',
  materiau_suspect: 'Materiau suspect',
  autre: 'Autre',
};

function AnomaliesPageContent() {
  const [statusFilter, setStatusFilter] = React.useState<AnomalyStatus | ''>('');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Anomaly | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['anomalies', 'all', page, statusFilter],
    queryFn: () => anomaliesService.listAll(page, 20, statusFilter || undefined),
  });

  const columns = React.useMemo<ColumnDef<Anomaly, any>[]>(
    () => [
      { header: 'Date', accessorKey: 'createdAt', cell: ({ row }) => formatDate(row.original.createdAt) },
      { header: 'Projet', id: 'project', cell: ({ row }) => row.original.project?.name || '-' },
      { header: 'Client', id: 'client', cell: ({ row }) => (row.original.client ? `${row.original.client.firstName} ${row.original.client.lastName}` : '-') },
      { header: 'Type', id: 'category', cell: ({ row }) => CATEGORY_LABELS[row.original.category] ?? row.original.category },
      { header: 'Description', accessorKey: 'description', cell: ({ row }) => <span className="line-clamp-1 max-w-xs">{row.original.description}</span> },
      {
        header: 'Statut',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge label={anomalyStatusMeta[row.original.status].label} tone={anomalyStatusMeta[row.original.status].tone} />,
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Anomalies signalees" description="Signalements des clients necessitant une investigation." />

      <div className="mb-4">
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as AnomalyStatus | ''); setPage(1); }} className="w-56">
          <option value="">Tous les statuts</option>
          <option value="OPEN">Ouverts</option>
          <option value="INVESTIGATING">En investigation</option>
          <option value="RESOLVED">Resolus</option>
          <option value="REJECTED">Rejetes</option>
        </Select>
      </div>

      {isError ? (
        <ErrorState message="Impossible de charger les anomalies." />
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          emptyTitle="Aucune anomalie"
          emptyDescription="Aucun client n'a signale d'anomalie pour le moment."
          onRowClick={setSelected}
          meta={data?.meta}
          onPageChange={setPage}
        />
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
    <Dialog open onClose={onClose} title="Traiter le signalement" description={`${CATEGORY_LABELS[anomaly.category] ?? anomaly.category} - ${anomaly.project?.name ?? ''}`}>
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
