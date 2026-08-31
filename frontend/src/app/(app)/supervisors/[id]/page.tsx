'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Ban, CheckCircle2 } from 'lucide-react';
import { supervisorsService } from '@/services/supervisors.service';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { userStatusMeta } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import { RequireRole } from '@/components/shared/require-role';

function SupervisorDetailPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: supervisor, isLoading, isError } = useQuery({
    queryKey: ['supervisors', params.id],
    queryFn: () => supervisorsService.get(params.id),
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'ACTIVE' | 'SUSPENDED') => supervisorsService.setStatus(params.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors', params.id] });
      toast.success('Statut mis a jour.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !supervisor) return <ErrorState message="Impossible de charger ce superviseur." />;

  const isSuspended = supervisor.user?.status === 'SUSPENDED';

  return (
    <div>
      <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">
            {supervisor.firstName} {supervisor.lastName}
          </h1>
          <p className="mt-1 text-sm text-ink-500">{supervisor.user?.email}</p>
          {supervisor.user && (
            <div className="mt-2">
              <StatusBadge label={userStatusMeta[supervisor.user.status].label} tone={userStatusMeta[supervisor.user.status].tone} />
            </div>
          )}
        </div>
        {isSuspended ? (
          <Button size="sm" onClick={() => statusMutation.mutate('ACTIVE')} loading={statusMutation.isPending}>
            <CheckCircle2 className="h-4 w-4" /> Réactiver
          </Button>
        ) : (
          <Button variant="danger" size="sm" onClick={() => statusMutation.mutate('SUSPENDED')} loading={statusMutation.isPending}>
            <Ban className="h-4 w-4" /> Suspendre
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 text-sm">
            <h3 className="font-display text-sm font-semibold text-ink-700">Informations</h3>
            <InfoRow label="Telephone" value={supervisor.phone} />
            <InfoRow label="Profession" value={supervisor.profession} />
            <InfoRow label="Adresse" value={supervisor.address} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h3 className="mb-3 font-display text-sm font-semibold text-ink-700">Projets affectés</h3>
            {!supervisor.projectAssignments || supervisor.projectAssignments.length === 0 ? (
              <p className="text-sm text-ink-400">Aucun projet affecté.</p>
            ) : (
              <ul className="divide-y divide-concrete">
                {supervisor.projectAssignments.map((a) => (
                  <li key={a.project.id} className="py-2.5">
                    <Link href={`/projects/${a.project.id}`} className="font-medium text-ink-800 hover:text-blueprint-600 hover:underline">
                      {a.project.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between border-b border-concrete-light pb-2 last:border-0">
      <span className="text-ink-400">{label}</span>
      <span className="text-ink-800">{value || '-'}</span>
    </div>
  );
}

export default function SupervisorDetailPage() {
  return (
    <RequireRole roles={['CLIENT', 'SUPERADMIN']}>
      <SupervisorDetailPageContent />
    </RequireRole>
  );
}
