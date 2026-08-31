// ============================================================================
// app/(app)/audit/page.tsx - v2.1
// Remplacement des deux blocs JSON bruts ("Ancienne valeur"/"Nouvelle
// valeur" en <pre>) par une vraie comparaison champ par champ, lisible :
// - computeDiff() calcule uniquement les champs qui ont reellement change
//   entre oldValue et newValue (les champs identiques sont masques, tout
//   comme id/createdAt/updatedAt qui n'apportent rien a la lecture).
// - Chaque champ change est affiche avec un libelle en francais
//   (FIELD_LABELS, avec repli sur une version "humanisee" de la cle brute
//   pour les champs non repertories), l'ancienne valeur en rouge barre,
//   une fleche, puis la nouvelle valeur en vert.
// - formatValue() adapte l'affichage selon le type : booleens -> Oui/Non,
//   dates ISO -> formatDateTime, champs monetaires connus (amount, total,
//   budget, unitPrice...) -> formatMoney, reste -> texte brut ou nombre
//   avec separateurs de milliers.
// - Entite affichee avec un libelle francais (ENTITY_LABELS) et l'UUID
//   raccourci (8 premiers caracteres) au lieu de l'identifiant complet.
// Reste du fichier (liste, filtres, pagination, AuditEntryCard) inchange.
// ============================================================================

'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { auditService } from '@/services/audit.service';
import { PageHeader } from '@/components/shared/page-header';
import { AuditEntryCard, ACTION_LABELS } from '@/components/audit/audit-entry-card';
import { Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageSpinner, ErrorState, EmptyState } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { AuditLogEntry } from '@/types/models';
import { RequireRole } from '@/components/shared/require-role';

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE_SOFT', 'APPROVE', 'REJECT', 'CANCEL', 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'ADMIN_CORRECTION'];

const ENTITY_LABELS: Record<string, string> = {
  Deposit: 'Depot',
  Expense: 'Depense',
  Project: 'Projet',
  ProjectSupervisor: 'Affectation superviseur',
  Client: 'Client',
  Supervisor: 'Superviseur',
  User: 'Utilisateur',
  Unit: 'Unite',
  Material: 'Materiau',
  ExpenseCategory: 'Categorie',
  Anomaly: 'Anomalie',
  Message: 'Message',
  Setting: 'Reglage',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Nom',
  firstName: 'Prenom',
  lastName: 'Nom',
  email: 'Email',
  phone: 'Telephone',
  profession: 'Profession',
  address: 'Adresse',
  city: 'Ville',
  country: 'Pays',
  companyName: 'Societe',
  companyAddress: 'Adresse de la societe',
  symbol: 'Symbole',
  group: 'Groupe',
  isActive: 'Statut',
  isArchived: 'Archive',
  isLocked: 'Verrouille',
  status: 'Statut',
  amount: 'Montant',
  total: 'Total',
  budget: 'Budget',
  currency: 'Devise',
  date: 'Date',
  motif: 'Motif',
  reference: 'Reference',
  observation: 'Observation',
  paymentMethod: 'Mode de versement',
  paymentStatus: 'Statut de paiement',
  amountPaidToSupplier: 'Montant verse au fournisseur',
  quantity: 'Quantite',
  unit: 'Unite',
  unitPrice: 'Prix unitaire',
  supplier: 'Fournisseur',
  invoiceReference: 'Reference facture',
  categoryId: 'Categorie',
  materialId: 'Materiau',
  defaultUnitId: 'Unite par defaut',
  autoApproveExpenses: 'Validation automatique',
  expenseApprovalThreshold: 'Seuil de validation',
  estimatedCost: 'Cout estimatif',
  surfaceArea: 'Superficie',
  roomCount: 'Nombre de pieces',
  projectType: 'Type de projet',
  constructionType: 'Type de construction',
  location: 'Adresse / lieu-dit',
  description: 'Description',
  rejectionReason: 'Motif du refus',
  reason: 'Motif',
  subject: 'Sujet',
  body: 'Message',
  taxId: 'Numero fiscal',
  notes: 'Notes',
};

const MONEY_FIELDS = new Set(['amount', 'total', 'budget', 'unitPrice', 'expenseApprovalThreshold', 'amountPaidToSupplier', 'estimatedCost']);

const HIDDEN_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

function humanizeKey(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (MONEY_FIELDS.has(key)) {
    const num = typeof value === 'string' ? parseFloat(value) : (value as number);
    if (!Number.isNaN(num)) return formatMoney(num, '');
  }
  if (typeof value === 'number') return new Intl.NumberFormat('fr-FR').format(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      try {
        return formatDateTime(value);
      } catch {
        return value;
      }
    }
    return value;
  }
  return JSON.stringify(value);
}

function shortenId(id?: string | null): string {
  if (!id) return '';
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

interface DiffEntry {
  key: string;
  oldVal: unknown;
  newVal: unknown;
}

function computeDiff(oldValue: unknown, newValue: unknown): DiffEntry[] {
  const oldObj = isPlainObject(oldValue) ? oldValue : null;
  const newObj = isPlainObject(newValue) ? newValue : null;

  if (oldObj && newObj) {
    const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
    return keys
      .filter((k) => !HIDDEN_FIELDS.has(k))
      .filter((k) => JSON.stringify(oldObj[k]) !== JSON.stringify(newObj[k]))
      .map((k) => ({ key: k, oldVal: oldObj[k], newVal: newObj[k] }));
  }
  if (newObj && !oldObj) {
    return Object.keys(newObj)
      .filter((k) => !HIDDEN_FIELDS.has(k))
      .map((k) => ({ key: k, oldVal: undefined, newVal: newObj[k] }));
  }
  if (oldObj && !newObj) {
    return Object.keys(oldObj)
      .filter((k) => !HIDDEN_FIELDS.has(k))
      .map((k) => ({ key: k, oldVal: oldObj[k], newVal: undefined }));
  }
  return [];
}

function ChangeRow({ fieldKey, oldVal, newVal }: { fieldKey: string; oldVal: unknown; newVal: unknown }) {
  const hasOld = oldVal !== undefined;
  const hasNew = newVal !== undefined;

  return (
    <div className="border-b border-concrete-light py-2.5 last:border-0">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{humanizeKey(fieldKey)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        {hasOld && (
          <span className="rounded-md bg-clay-50 px-2 py-1 text-clay-600 line-through decoration-clay-300">
            {formatValue(fieldKey, oldVal)}
          </span>
        )}
        {hasOld && hasNew && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />}
        {hasNew && (
          <span className="rounded-md bg-moss-50 px-2 py-1 font-medium text-moss-700">{formatValue(fieldKey, newVal)}</span>
        )}
      </div>
    </div>
  );
}

function AuditPageContent() {
  const [entityType, setEntityType] = React.useState('');
  const [action, setAction] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AuditLogEntry | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', page, entityType, action],
    queryFn: () => auditService.list({ page, limit: 25, entityType: entityType || undefined, action: action || undefined }),
  });

  const diff = selected ? computeDiff(selected.oldValue, selected.newValue) : [];

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
            <Row
              label="Entite"
              value={`${ENTITY_LABELS[selected.entityType] ?? selected.entityType}${selected.entityId ? ` · ${shortenId(selected.entityId)}` : ''}`}
            />
            {selected.reason && <Row label="Motif" value={selected.reason} />}

            {(selected.oldValue != null || selected.newValue != null) && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">Modifications</p>
                {diff.length > 0 ? (
                  <div className="rounded-md border border-concrete bg-paper/60 px-3">
                    {diff.map((d) => (
                      <ChangeRow key={d.key} fieldKey={d.key} oldVal={d.oldVal} newVal={d.newVal} />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md bg-paper px-3 py-2.5 text-xs text-ink-400">Aucun changement de champ detecte.</p>
                )}
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