//frontend/src/app/(app)/audit/page.tsx
'use client';

import * as React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { auditService } from '@/services/audit.service';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { Select } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/format';
import type { AuditLogEntry } from '@/types/models';
import { RequireRole } from '@/components/shared/require-role';

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE_SOFT', 'APPROVE', 'REJECT', 'CANCEL', 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'ADMIN_CORRECTION'];
const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Creation',
  UPDATE: 'Modification',
  DELETE_SOFT: 'Suppression logique',
  APPROVE: 'Validation',
  REJECT: 'Refus',
  CANCEL: 'Annulation',
  LOGIN: 'Connexion',
  LOGOUT: 'Deconnexion',
  PASSWORD_CHANGE: 'Changement de mot de passe',
  ADMIN_CORRECTION: 'Correction administrative',
};

function AuditPageContent() {
  const [entityType, setEntityType] = React.useState('');
  const [action, setAction] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AuditLogEntry | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', page, entityType, action],
    queryFn: () => auditService.list({ page, limit: 25, entityType: entityType || undefined, action: action || undefined }),
  });

  const columns = React.useMemo<ColumnDef<AuditLogEntry, any>[]>(
    () => [
      { header: 'Date', accessorKey: 'createdAt', cell: ({ row }) => formatDateTime(row.original.createdAt) },
      { header: 'Utilisateur', id: 'user', cell: ({ row }) => row.original.user?.email || 'Systeme' },
      { header: 'Role', id: 'role', cell: ({ row }) => row.original.userRole || '-' },
      { header: 'Action', id: 'action', cell: ({ row }) => ACTION_LABELS[row.original.action] ?? row.original.action },
      { header: 'Entite', accessorKey: 'entityType' },
      { header: 'Motif', id: 'reason', cell: ({ row }) => <span className="line-clamp-1 max-w-xs">{row.original.reason || '-'}</span> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Journal d'audit" description="Historique inviolable de toutes les operations sensibles de la plateforme." />

      <div className="mb-4 flex gap-3">
        <Select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className="w-48">
          <option value="">Toutes les entites</option>
          <option value="Deposit">Depots</option>
          <option value="Expense">Depenses</option>
          <option value="Project">Projets</option>
          <option value="Client">Clients</option>
          <option value="Supervisor">Superviseurs</option>
          <option value="User">Utilisateurs</option>
        </Select>
        <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="w-56">
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
      ) : (
        <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading} emptyTitle="Aucune entree" onRowClick={setSelected} meta={data?.meta} onPageChange={setPage} />
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
                <pre className="overflow-x-auto rounded-md bg-paper px-3 py-2 font-ledger text-xs">{JSON.stringify(selected.oldValue, null, 2)}</pre>
              </div>
            )}
            {selected.newValue != null && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">Nouvelle valeur</p>
                <pre className="overflow-x-auto rounded-md bg-paper px-3 py-2 font-ledger text-xs">{JSON.stringify(selected.newValue, null, 2)}</pre>
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
    <div className="flex justify-between border-b border-concrete-light pb-2">
      <span className="text-ink-400">{label}</span>
      <span className="text-ink-800">{value}</span>
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
