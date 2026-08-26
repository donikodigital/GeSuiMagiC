// frontend/src/components/projects/project-list-card.tsx
'use client';

import Link from 'next/link';
import { Building2, ChevronRight, HardHat, PiggyBank, Wallet } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { formatMoney, projectStatusMeta } from '@/lib/format';
import type { Project } from '@/types/models';

export function ProjectListCard({
  project,
  showClient,
  showStatus,
  showBudget,
  showBalance,
}: {
  project: Project;
  showClient: boolean;
  showStatus: boolean;
  showBudget: boolean;
  showBalance: boolean;
}) {
  const balance = parseFloat(project.wallet?.balance ?? '0');
  const statusTone = projectStatusMeta[project.status].tone;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex items-center gap-4 rounded-card border border-concrete bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-blueprint-200 hover:shadow-md active:translate-y-0 sm:p-5"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
        <HardHat className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-medium text-ink-900">{project.name}</p>
          {showStatus && <StatusBadge label={projectStatusMeta[project.status].label} tone={statusTone} className="shrink-0" />}
        </div>

        <p className="mt-0.5 truncate text-xs text-ink-400">
          {[project.city, project.country].filter(Boolean).join(', ') || 'Localisation non renseignee'}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
          {showClient && project.client && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-ink-300" />
              {project.client.firstName} {project.client.lastName}
            </span>
          )}
          {showBudget && (
            <span className="inline-flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5 text-ink-300" />
              <span className="font-ledger">{formatMoney(project.budget, project.currency)}</span>
            </span>
          )}
          {showBalance && (
            <span className={`inline-flex items-center gap-1 font-ledger font-medium ${balance < 0 ? 'text-clay-600' : 'text-ink-700'}`}>
              <PiggyBank className="h-3.5 w-3.5 text-ink-300" />
              {formatMoney(balance, project.currency)}
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blueprint-500" />
    </Link>
  );
}