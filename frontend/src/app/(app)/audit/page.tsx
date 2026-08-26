// ============================================================================
// app/(app)/audit/page.tsx - v2.0
// Refonte mobile complete.
// - Filtres (Select entite/action) passaient en flex-row non-wrap avec des
//   largeurs fixes (w-48/w-56) qui debordaient sur mobile. Passe en
//   flex-col sm:flex-row, largeur w-full sm:w-48/56.
// - DataTable (6 colonnes) remplace par une liste de AuditEntryCard - c'etait
//   la source directe du scroll horizontal sur la liste. Pagination geree
//   manuellement (meme pattern que clients/supervisors), DataTable non
//   touche pour ne pas casser les autres ecrans qui l'utilisent encore.
// - Modal de detail : Row etait en flex justify-between sur une ligne,
//   forcant les valeurs longues (email, date, UUID) a deborder hors de
//   l'ecran (visible sur la capture). Passe en layout empile (label au-
//   dessus, valeur en dessous, break-words) - supprime le scroll horizontal
//   sans exception. Les blocs JSON (ancienne/nouvelle valeur) passent en
//   whitespace-pre-wrap break-all avec une hauteur max scrollable
//   verticalement, au lieu de overflow-x-auto.
// ============================================================================

'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { auditService } from '@/services/audit.service';
import { PageHeader } from '@/components/shared/page-header';
import { AuditEntryCard, ACTION_LABELS } from '@/components/audit/audit-entry-card';
import { Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageSpinner, ErrorState, EmptyState } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/format';
import type { AuditLogEntry } from '@/types/models';
import { RequireRole } from '@/components/shared/require-role';

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE_SOFT', 'APPROVE', 'REJECT', 'CANCEL', 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'ADMIN_CORRECTION'];

function AuditPageContent() {
  const [entityType, setEntityType] = React.useState('');
  const [action, setAction] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AuditLogEntry | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', page, entityType, action],
    queryFn: () => auditService.list({ page, limit: 25, entityType: entityType || undefined, action: action || undefined }),
  });

  return (
    <div>
      <PageHeader title="Journal d'audit" description="Historique inviolable de toutes les operations sensibles de la plateforme." />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-48"
        >
          <option value="">Toutes les entites</option>
          <option value="Deposit">Depots</option>
          <option value="Expense">Depenses</option>
          <option value="Project">Projets</option>
          <option value="Client">Clients</option>
          <option value="Supervisor">Superviseurs</option>
          <option value="User">Utilisateurs</option>
        </Select>
        <Select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-56"
        >
          <option value="">Toutes les actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </Select>
      </div>

      {isError ? (
        <ErrorState message="Impossible de charger le journal d'audit." />
      ) : isLoading ? (
        <PageSpinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState title="Aucune entree" />
      ) : (
        <>
          <div className="space-y-3">
            {(data?.items ?? []).map((entry) => (
              <AuditEntryCard key={entry.id} entry={entry} onClick={() => setSelected(entry)} />
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

      {selected && (
        <Dialog open onClose={() => setSelected(null)} title="Detail de l'evenement" maxWidth="max-w-xl">
          <div className="space-y-3 text-sm">
            <Row label="Date" value={formatDateTime(selected.createdAt)} />
            <Row label="Utilisateur" value={selected.user?.email || 'Systeme'} />
            <Row label="Action" value={ACTION_LABELS[selected.action] ?? selected.action} />
            <Row label="Entite" value={`${selected.entityType}${selected.entityId ? ` (${selected.entityId})` : ''}`} />
            {selected.reason && <Row label="Motif" value={selected.reason} />}
            {selected.oldValue != null && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">Ancienne valeur</p>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-paper px-3 py-2 font-ledger text-xs">
                  {JSON.stringify(selected.oldValue, null, 2)}
                </pre>
              </div>
            )}
            {selected.newValue != null && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">Nouvelle valeur</p>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-paper px-3 py-2 font-ledger text-xs">
                  {JSON.stringify(selected.newValue, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-concrete-light pb-2">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-0.5 break-words text-sm text-ink-800">{value}</p>
    </div>
  );
}

export default function AuditPage() {
  return (
    <RequireRole roles={['SUPERADMIN']}>
      <AuditPageContent />
    </RequireRole>
  );
}