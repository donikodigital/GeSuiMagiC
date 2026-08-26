// frontend/src/components/clients/client-card.tsx
'use client';

import Link from 'next/link';
import { Building2, ChevronRight, Clock, FolderKanban, MapPin } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { userStatusMeta, formatRelative, initials } from '@/lib/format';
import type { ClientProfile } from '@/types/models';

export function ClientCard({ client }: { client: ClientProfile }) {
  const projectCount = client._count?.projects ?? 0;

  return (
    <Link
      href={`/clients/${client.id}`}
      className="group flex items-center gap-4 rounded-card border border-concrete bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-blueprint-200 hover:shadow-md active:translate-y-0 sm:p-5"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blueprint-50 font-display text-sm font-semibold text-blueprint-700">
        {initials(client.firstName, client.lastName)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-medium text-ink-900">
            {client.firstName} {client.lastName}
          </p>
          {client.user && (
            <StatusBadge
              label={userStatusMeta[client.user.status].label}
              tone={userStatusMeta[client.user.status].tone}
              className="shrink-0"
            />
          )}
          {!client.isActive && <StatusBadge label="Suspendu par l'admin" tone="clay" className="shrink-0" />}
        </div>

        {client.user?.email && <p className="mt-0.5 truncate text-sm text-ink-400">{client.user.email}</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
          {client.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-ink-300" />
              {client.city}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <FolderKanban className="h-3.5 w-3.5 text-ink-300" />
            {projectCount} projet{projectCount > 1 ? 's' : ''}
          </span>
          {client.companyName && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-ink-300" />
              {client.companyName}
            </span>
          )}
          {client.user?.lastLoginAt && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-ink-300" />
              {formatRelative(client.user.lastLoginAt)}
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blueprint-500" />
    </Link>
  );
}