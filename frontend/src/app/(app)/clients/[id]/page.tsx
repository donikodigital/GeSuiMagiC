// frontend/src/app/(app)/clients/[id]/page.tsx - v1.4
// Refonte visuelle demandee : creation d'un hero (meme identite navy que
// l'en-tete des pages projet dans layout.tsx - degrade + motif compass en
// filigrane), avec avatar initiales, nom/email/badges regroupes, et les
// 4 actions (Modifier/Suspendre-Reactiver/Renvoyer/Supprimer) transformees
// en icones rondes + libelle, dans une barre d'actions translucide en bas
// du hero plutot qu'en boutons texte separes. StatusBadge deja eprouve
// sur fond navy ailleurs dans l'app (meme composant utilise tel quel dans
// le hero du layout projet) - reutilise sans modification. Cartes
// Informations/Projets en dessous inchangees. Aucun changement de
// logique/mutations/endpoints par rapport a v1.3.
// ============================================================================

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, CheckCircle2, Loader2, Pencil, Send, Trash2 } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { clientsService } from '@/services/clients.service';
import { useProjects } from '@/hooks/use-projects';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { EditClientDialog } from '@/components/clients/edit-client-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { userStatusMeta, projectStatusMeta, formatMoney, formatDate, initials } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import Link from 'next/link';
import { RequireRole } from '@/components/shared/require-role';
import { cn } from '@/lib/utils';

function HeroAction({
  icon: Icon,
  label,
  onClick,
  loading,
  disabled,
  tone = 'neutral',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'neutral' | 'danger' | 'positive' | 'gold';
}) {
  const toneClasses: Record<string, string> = {
    neutral: 'bg-white/10 text-white hover:bg-white/20',
    danger: 'bg-[#FFB4A2]/15 text-[#FFB4A2] hover:bg-[#FFB4A2]/25',
    positive: 'bg-[#8FE3B0]/15 text-[#8FE3B0] hover:bg-[#8FE3B0]/25',
    gold: 'bg-[#C9A24A]/20 text-[#E9C878] hover:bg-[#C9A24A]/30',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="flex flex-1 flex-col items-center gap-1.5 py-0.5 transition-opacity disabled:opacity-50"
    >
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-full transition-colors', toneClasses[tone])}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="text-[11px] font-medium text-white/70">{label}</span>
    </button>
  );
}

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

      <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1330] via-[#122057] to-[#1B2E6E] px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
        <svg
          aria-hidden="true"
          viewBox="0 0 200 200"
          className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 opacity-[0.08] sm:h-52 sm:w-52"
        >
          <circle cx="100" cy="100" r="80" fill="none" stroke="#E7D9AE" strokeWidth="1" strokeDasharray="2 6" />
          <circle cx="100" cy="100" r="58" fill="none" stroke="#E7D9AE" strokeWidth="1" />
        </svg>

        <div className="relative flex items-start gap-3.5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10 font-display text-lg font-semibold text-white ring-1 ring-white/15">
            {initials(client.firstName, client.lastName)}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="truncate font-display text-xl font-semibold text-white sm:text-2xl">
              {client.firstName} {client.lastName}
            </h1>
            <p className="mt-0.5 truncate text-sm text-white/60">{client.user?.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {client.user && <StatusBadge label={userStatusMeta[client.user.status].label} tone={userStatusMeta[client.user.status].tone} />}
              {!client.isActive && <StatusBadge label="Suspendu par l'admin" tone="clay" />}
            </div>
          </div>
        </div>

        <div className="relative mt-5 flex items-stretch gap-1 rounded-2xl border border-white/10 bg-white/5 px-1.5 py-3 backdrop-blur-sm">
          <HeroAction icon={Pencil} label="Modifier" onClick={() => setEditOpen(true)} />
          {client.isActive ? (
            <HeroAction
              icon={Ban}
              label="Suspendre"
              tone="danger"
              onClick={() => suspendMutation.mutate()}
              loading={suspendMutation.isPending}
            />
          ) : (
            <HeroAction
              icon={CheckCircle2}
              label="Réactiver"
              tone="positive"
              onClick={() => reactivateMutation.mutate()}
              loading={reactivateMutation.isPending}
            />
          )}
          {isInvitePending && (
            <HeroAction
              icon={Send}
              label="Renvoyer"
              tone="gold"
              onClick={() => resendInvitationMutation.mutate()}
              loading={resendInvitationMutation.isPending}
            />
          )}
          {canDelete && <HeroAction icon={Trash2} label="Supprimer" tone="danger" onClick={() => setDeleteOpen(true)} />}
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