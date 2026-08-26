// frontend/src/components/audit/audit-entry-card.tsx
'use client';

import { Ban, CheckCircle2, ChevronRight, KeyRound, LogIn, LogOut, Pencil, Plus, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import type { AuditLogEntry } from '@/types/models';

type Tone = 'moss' | 'safety' | 'clay' | 'ink' | 'blueprint';

export const ACTION_LABELS: Record<string, string> = {
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

const ACTION_TONE: Record<string, Tone> = {
  CREATE: 'moss',
  UPDATE: 'blueprint',
  DELETE_SOFT: 'clay',
  APPROVE: 'moss',
  REJECT: 'clay',
  CANCEL: 'ink',
  LOGIN: 'blueprint',
  LOGOUT: 'ink',
  PASSWORD_CHANGE: 'safety',
  ADMIN_CORRECTION: 'safety',
};

const ACTION_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  CREATE: Plus,
  UPDATE: Pencil,
  DELETE_SOFT: Trash2,
  APPROVE: CheckCircle2,
  REJECT: XCircle,
  CANCEL: Ban,
  LOGIN: LogIn,
  LOGOUT: LogOut,
  PASSWORD_CHANGE: KeyRound,
  ADMIN_CORRECTION: ShieldAlert,
};

const TONE_ICON_BG: Record<Tone, string> = {
  moss: 'bg-moss-50 text-moss-600',
  safety: 'bg-safety-50 text-safety-500',
  clay: 'bg-clay-50 text-clay-600',
  ink: 'bg-ink-50 text-ink-600',
  blueprint: 'bg-blueprint-50 text-blueprint-700',
};

export function AuditEntryCard({ entry, onClick }: { entry: AuditLogEntry; onClick: () => void }) {
  const tone = ACTION_TONE[entry.action] ?? 'ink';
  const Icon = ACTION_ICON[entry.action] ?? Pencil;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-card border border-concrete bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-blueprint-200 hover:shadow-md active:translate-y-0"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONE_ICON_BG[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="truncate font-medium text-ink-900">{ACTION_LABELS[entry.action] ?? entry.action}</p>
          <span className="shrink-0 text-xs text-ink-400">{formatDateTime(entry.createdAt)}</span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-500">
          <span className="truncate">{entry.user?.email || 'Systeme'}</span>
          {entry.userRole && (
            <>
              <span className="text-ink-300">·</span>
              <span>{entry.userRole}</span>
            </>
          )}
          <span className="text-ink-300">·</span>
          <span className="truncate">{entry.entityType}</span>
        </div>

        {entry.reason && <p className="mt-1.5 truncate text-xs text-ink-400">{entry.reason}</p>}
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blueprint-500" />
    </button>
  );
}