// frontend/src/app/(app)/projects/[id]/anomalies/page.tsx - v2.0
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Plus, ShieldAlert } from 'lucide-react';
import { anomaliesService } from '@/services/anomalies.service';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Select, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { PageSpinner, EmptyState, ErrorState } from '@/components/ui/misc';
import { anomalyStatusMeta, formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api-client';

const CATEGORY_LABELS: Record<string, string> = {
  depense_inconnue: 'Depense inconnue',
  montant_incorrect: 'Montant incorrect',
  doublon: 'Doublon',
  justificatif_absent: 'Justificatif absent',
  materiau_suspect: 'Materiau suspect',
  autre: 'Autre',
};

const TONE_ICON_BG: Record<string, string> = {
  moss: 'bg-moss-50 text-moss-600',
  safety: 'bg-safety-50 text-safety-500',
  clay: 'bg-clay-50 text-clay-600',
  ink: 'bg-ink-50 text-ink-600',
  blueprint: 'bg-blueprint-50 text-blueprint-700',
};

export default function ProjectAnomaliesPage() {
  const params = useParams<{ id: string }>();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['anomalies', params.id],
    queryFn: () => anomaliesService.listForProject(params.id),
  });

  if (isLoading) return <PageSpinner />;
  if (isError) return <ErrorState message="Impossible de charger les signalements." />;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> Signaler une anomalie
        </Button>
      </div>

      {data?.items.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="Aucune anomalie signalee"
          description="Signalez toute depense ou operation qui vous semble incorrecte."
        />
      ) : (
        <div className="space-y-3">
          {data?.items.map((a) => {
            const tone = anomalyStatusMeta[a.status].tone;
            return (
              <Card key={a.id}>
                <CardContent className="flex items-start gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONE_ICON_BG[tone]}`}>
                    <ShieldAlert className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                        {CATEGORY_LABELS[a.category] ?? a.category}
                      </p>
                      <StatusBadge label={anomalyStatusMeta[a.status].label} tone={tone} />
                    </div>
                    <p className="mt-1 text-sm text-ink-800">{a.description}</p>
                    <p className="mt-1 text-xs text-ink-400">{formatDate(a.createdAt)}</p>
                    {a.resolutionNote && (
                      <p className="mt-2 rounded-md bg-paper px-3 py-2 text-xs text-ink-600">Reponse : {a.resolutionNote}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AnomalyDialog open={dialogOpen} onClose={() => setDialogOpen(false)} projectId={params.id} />
    </div>
  );
}

function AnomalyDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = React.useState('depense_inconnue');
  const [description, setDescription] = React.useState('');

  const mutation = useMutation({
    mutationFn: () => anomaliesService.create(projectId, { category, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anomalies', projectId] });
      toast.success('Signalement envoye au superadmin.');
      onClose();
      setDescription('');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Impossible d'envoyer le signalement."),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Signaler une anomalie">
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-card border border-safety-200 bg-safety-50 px-3.5 py-3 text-xs text-safety-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Le superadministrateur sera notifie et pourra vous repondre directement.</p>
        </div>

        <FormField label="Type d'anomalie" htmlFor="anomaly-category" required>
          <Select id="anomaly-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Description" htmlFor="anomaly-description" required>
          <Textarea
            id="anomaly-description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Decrivez ce qui vous parait incorrect..."
          />
        </FormField>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={description.trim().length < 5}>
          Envoyer le signalement
        </Button>
      </div>
    </Dialog>
  );
}