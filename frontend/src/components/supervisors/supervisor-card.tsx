// frontend/src/components/supervisors/supervisor-card.tsx
'use client';

import Link from 'next/link';
import { ChevronRight, Clock, FolderKanban, Phone } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { userStatusMeta, formatRelative, initials } from '@/lib/format';
import type { SupervisorProfile } from '@/types/models';

export function SupervisorCard({ supervisor }: { supervisor: SupervisorProfile }) {
  const projects = supervisor.projectAssignments ?? [];
  const visibleProjects = projects.slice(0, 2);
  const extraCount = projects.length - visibleProjects.length;

  return (
    <Link
      href={`/supervisors/${supervisor.id}`}
      className="group flex items-center gap-4 rounded-card border border-concrete bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-blueprint-200 hover:shadow-md active:translate-y-0 sm:p-5"
    >
      {supervisor.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={supervisor.photoUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blueprint-50 font-display text-sm font-semibold text-blueprint-700">
          {initials(supervisor.firstName, supervisor.lastName)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-medium text-ink-900">
            {supervisor.firstName} {supervisor.lastName}
          </p>
          {supervisor.user && (
            <StatusBadge
              label={userStatusMeta[supervisor.user.status].label}
              tone={userStatusMeta[supervisor.user.status].tone}
              className="shrink-0"
            />
          )}
        </div>

        {supervisor.user?.email && <p className="mt-0.5 truncate text-sm text-ink-400">{supervisor.user.email}</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
          {supervisor.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5 text-ink-300" />
              {supervisor.phone}
            </span>
          )}
          <span className="inline-flex min-w-0 items-center gap-1">
            <FolderKanban className="h-3.5 w-3.5 shrink-0 text-ink-300" />
            <span className="truncate">
              {projects.length === 0
                ? 'Aucun projet affecte'
                : visibleProjects.map((a) => a.project.name).join(', ') + (extraCount > 0 ? ` +${extraCount}` : '')}
            </span>
          </span>
          {supervisor.user?.lastLoginAt && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-ink-300" />
              {formatRelative(supervisor.user.lastLoginAt)}
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blueprint-500" />
    </Link>
  );
}