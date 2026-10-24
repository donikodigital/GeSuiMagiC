//frontend/src/app/(app)/projects/[id]/supervisors/page.tsx
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { UserMinus, UserPlus } from 'lucide-react';
import { useProject, useAssignSupervisor, useRevokeSupervisor, useUpdateSupervisorPosition } from '@/hooks/use-projects';
import type { SupervisorPosition } from '@/services/projects.service';
import { siteRoleLabels } from '@/lib/site-format';
import { useAuth } from '@/hooks/use-auth';
import { supervisorsService } from '@/services/supervisors.service';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { PageSpinner, ErrorState, EmptyState } from '@/components/ui/misc';
import { initials } from '@/lib/format';

const POSITIONS: SupervisorPosition[] = ['SUPERVISOR', 'SITE_MANAGER', 'ARCHITECT'];
const POSITION_HINT: Record<SupervisorPosition, string> = {
  SUPERVISOR: 'Saisit les dépenses, les présences et la paie.',
  SITE_MANAGER: 'Dirige les travaux : validation technique, planning, situations de travaux.',
  ARCHITECT: "Suit la qualité : avancement, réserves, réception, avis technique.",
};

export default function ProjectSupervisorsPage() {
  const params = useParams<{ id: string }>();
  const { isClient } = useAuth();
  const { data: project, isLoading, isError } = useProject(params.id);
  const assignMutation = useAssignSupervisor(params.id);
  const revokeMutation = useRevokeSupervisor(params.id);
  const positionMutation = useUpdateSupervisorPosition(params.id);

  const allSupervisorsQuery = useQuery({
    queryKey: ['supervisors', 'select-list'],
    queryFn: () => supervisorsService.list(1, 200),
    enabled: isClient,
  });

  const [selected, setSelected] = React.useState('');
  const [position, setPosition] = React.useState<SupervisorPosition>('SUPERVISOR');

  if (isLoading) return <PageSpinner />;
  if (isError || !project) return <ErrorState message="Impossible de charger les superviseurs." />;

  const assignedIds = new Set((project.supervisors ?? []).map((s) => s.supervisor.id));
  const available = allSupervisorsQuery.data?.items.filter((s) => !assignedIds.has(s.id)) ?? [];

  return (
    <div className="space-y-4">
      {isClient && (
        <Card>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Affecter un superviseur</label>
              <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Selectionner un superviseur</option>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:w-56">
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Fonction sur le chantier</label>
              <Select value={position} onChange={(e) => setPosition(e.target.value as SupervisorPosition)}>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {siteRoleLabels[p]}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              disabled={!selected}
              loading={assignMutation.isPending}
              onClick={() => {
                assignMutation.mutate({ supervisorId: selected, position }, { onSuccess: () => { setSelected(''); setPosition('SUPERVISOR'); } });
              }}
            >
              <UserPlus className="h-4 w-4" /> Affecter
            </Button>
          </CardContent>
        </Card>
      )}

      {(project.supervisors ?? []).length === 0 ? (
        <EmptyState title="Aucun superviseur affecté" description="Affectez un superviseur pour qu'il puisse enregistrer des dépenses sur ce chantier." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {project.supervisors!.map(({ supervisor, position: current }) => (
            <Card key={supervisor.id}>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blueprint-100 text-sm font-semibold text-blueprint-700">
                    {initials(supervisor.firstName, supervisor.lastName)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">
                      {supervisor.firstName} {supervisor.lastName}
                    </p>
                    <p className="text-xs text-ink-400">{supervisor.phone || '-'}</p>
                    {isClient ? (
                      <Select
                        value={current ?? 'SUPERVISOR'}
                        onChange={(e) => positionMutation.mutate({ supervisorId: supervisor.id, position: e.target.value as SupervisorPosition })}
                        disabled={positionMutation.isPending}
                        className="mt-1.5 h-8 w-full text-xs"
                        aria-label="Fonction sur le chantier"
                      >
                        {POSITIONS.map((p) => (
                          <option key={p} value={p}>
                            {siteRoleLabels[p]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <p className="mt-0.5 text-xs font-medium text-blueprint-600">{siteRoleLabels[current ?? 'SUPERVISOR']}</p>
                    )}
                    <p className="mt-1 text-[11px] leading-snug text-ink-400">{POSITION_HINT[current ?? 'SUPERVISOR']}</p>
                  </div>
                </div>
                {isClient && (
                  <button
                    onClick={() => revokeMutation.mutate(supervisor.id)}
                    className="rounded-md p-2 text-ink-300 hover:bg-clay-50 hover:text-clay-500"
                    aria-label="Revoquer"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
