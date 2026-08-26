// frontend/src/app/(app)/clients/[id]/page.tsx - v1.1
// Ajout d'un bouton "Modifier" ouvrant EditClientDialog, pour que le
// superadmin puisse renseigner/corriger profession, adresse et les autres
// champs de UpdateClientDto directement depuis la fiche client (jusque-la
// seul le client lui-meme pouvait editer une partie de ces infos via
// PATCH /clients/me). Aucun changement sur suspendre/reactiver.

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Ban, CheckCircle2, Pencil } from 'lucide-react';
import { clientsService } from '@/services/clients.service';
import { useProjects } from '@/hooks/use-projects';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { EditClientDialog } from '@/components/clients/edit-client-dialog';
import { userStatusMeta, projectStatusMeta, formatMoney, formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import Link from 'next/link';
import { RequireRole } from '@/components/shared/require-role';

function ClientDetailPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = React.useState(false);

  const { data: client, isLoading, isError } = useQuery({
    queryKey: ['clients', params.id],
    queryFn: () => clientsService.get(params.id),
  });
  const { data: projects } = useProjects({ clientId: params.id, limit: 50 });

  const suspendMutation = useMutation({
    mutationFn: () => clientsService.suspend(params.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', params.id] });
      toast.success('Client suspendu.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => clientsService.reactivate(params.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', params.id] });
      toast.success('Client reactive.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Action impossible.'),
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !client) return <ErrorState message="Impossible de charger ce client." />;

  return (
    <div>
      <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">
            {client.firstName} {client.lastName}
          </h1>
          <p className="mt-1 text-sm text-ink-500">{client.user?.email}</p>
          <div className="mt-2 flex items-center gap-2">
            {client.user && <StatusBadge label={userStatusMeta[client.user.status].label} tone={userStatusMeta[client.user.status].tone} />}
            {!client.isActive && <StatusBadge label="Suspendu par l'admin" tone="clay" />}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Modifier
          </Button>
          {client.isActive ? (
            <Button variant="danger" size="sm" onClick={() => suspendMutation.mutate()} loading={suspendMutation.isPending}>
              <Ban className="h-4 w-4" /> Suspendre
            </Button>
          ) : (
            <Button size="sm" onClick={() => reactivateMutation.mutate()} loading={reactivateMutation.isPending}>
              <CheckCircle2 className="h-4 w-4" /> Reactiver
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="space-y-3 text-sm">
            <h3 className="font-display text-sm font-semibold text-ink-700">Informations</h3>
            <InfoRow label="Telephone" value={client.phone} />
            <InfoRow label="Profession" value={client.profession} />
            <InfoRow label="Adresse" value={client.address} />
            <InfoRow label="Ville" value={client.city} />
            <InfoRow label="Pays" value={client.country} />
            <InfoRow label="Societe" value={client.companyName} />
            <InfoRow label="Client depuis" value={formatDate(client.createdAt)} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent>
            <h3 className="mb-3 font-display text-sm font-semibold text-ink-700">Projets ({projects?.meta.total ?? 0})</h3>
            {projects?.items.length === 0 ? (
              <p className="text-sm text-ink-400">Aucun projet pour ce client.</p>
            ) : (
              <ul className="divide-y divide-concrete">
                {projects?.items.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5">
                    <Link href={`/projects/${p.id}`} className="font-medium text-ink-800 hover:text-blueprint-600 hover:underline">
                      {p.name}
                    </Link>
                    <div className="flex items-center gap-3">
                      <span className="font-ledger text-sm text-ink-600">{formatMoney(p.wallet?.balance ?? 0, p.currency)}</span>
                      <StatusBadge label={projectStatusMeta[p.status].label} tone={projectStatusMeta[p.status].tone} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <EditClientDialog open={editOpen} onClose={() => setEditOpen(false)} client={client} />
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

export default function ClientDetailPage() {
  return (
    <RequireRole roles={['SUPERADMIN']}>
      <ClientDetailPageContent />
    </RequireRole>
  );
}