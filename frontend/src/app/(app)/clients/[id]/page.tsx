// frontend/src/app/(app)/clients/[id]/page.tsx - v1.3
// - Alignement force de Modifier/Suspendre(ou Reactiver)/Supprimer sur une
//   seule ligne : chaque bouton passe en flex-1 (largeurs egales, libelle
//   centre, whitespace-nowrap) plutot que flex-wrap qui les faisait
//   passer sur 2 lignes des que "Supprimer" apparaissait (canDelete) sur
//   mobile etroit - meme principe que les pastilles de categorie de
//   AttachmentsSection v2.2, pour eviter tout retour a la ligne comme
//   tout scroll horizontal.
// - Badge(s) de statut (Invite / Suspendu par l'admin) deplaces au-dessus
//   de l'email, alignes en haut a droite du bloc nom (avant : juste sous
//   l'email).
// - Nouveau bouton "Renvoyer le lien d'invitation", visible uniquement
//   quand le compte est toujours au statut INVITED (l'invitation initiale
//   peut avoir expire sans activation - demande superadmin suite a une
//   reclamation client). Appelle PATCH /clients/:id/resend-invitation.
// ============================================================================

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Ban, CheckCircle2, Pencil, Send, Trash2 } from 'lucide-react';
import { clientsService } from '@/services/clients.service';
import { useProjects } from '@/hooks/use-projects';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { EditClientDialog } from '@/components/clients/edit-client-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { userStatusMeta, projectStatusMeta, formatMoney, formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import Link from 'next/link';
import { RequireRole } from '@/components/shared/require-role';

function ClientDetailPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

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

  const removeMutation = useMutation({
    mutationFn: () => clientsService.remove(params.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client supprimé.');
      router.push('/clients');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Suppression impossible.');
      setDeleteOpen(false);
    },
  });

  const resendInvitationMutation = useMutation({
    mutationFn: () => clientsService.resendInvitation(params.id),
    onSuccess: () => toast.success("Lien d'invitation renvoyé."),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Impossible de renvoyer l'invitation."),
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !client) return <ErrorState message="Impossible de charger ce client." />;

  const canDelete = projects?.meta.total === 0;
  const isInvitePending = client.user?.status === 'INVITED';

  return (
    <div>
      <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>

      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 font-display text-2xl font-semibold text-ink-900">
            {client.firstName} {client.lastName}
          </h1>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5 pt-1">
            {client.user && <StatusBadge label={userStatusMeta[client.user.status].label} tone={userStatusMeta[client.user.status].tone} />}
            {!client.isActive && <StatusBadge label="Suspendu par l'admin" tone="clay" />}
          </div>
        </div>
        <p className="mt-1 truncate text-sm text-ink-500">{client.user?.email}</p>

        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 whitespace-nowrap" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Modifier
          </Button>
          {client.isActive ? (
            <Button
              variant="danger"
              size="sm"
              className="flex-1 whitespace-nowrap"
              onClick={() => suspendMutation.mutate()}
              loading={suspendMutation.isPending}
            >
              <Ban className="h-4 w-4" /> Suspendre
            </Button>
          ) : (
            <Button size="sm" className="flex-1 whitespace-nowrap" onClick={() => reactivateMutation.mutate()} loading={reactivateMutation.isPending}>
              <CheckCircle2 className="h-4 w-4" /> Réactiver
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" size="sm" className="flex-1 whitespace-nowrap" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Supprimer
            </Button>
          )}
        </div>

        {isInvitePending && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full border-safety-300 text-safety-500 hover:bg-safety-50"
            onClick={() => resendInvitationMutation.mutate()}
            loading={resendInvitationMutation.isPending}
          >
            <Send className="h-4 w-4" /> Renvoyer le lien d&apos;invitation
          </Button>
        )}
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

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => removeMutation.mutate()}
        title="Supprimer ce client ?"
        description={`Cette action est définitive : ${client.firstName} ${client.lastName} et son compte seront supprimés. Cette opération est irréversible.`}
        confirmLabel="Supprimer définitivement"
        danger
        loading={removeMutation.isPending}
      />
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