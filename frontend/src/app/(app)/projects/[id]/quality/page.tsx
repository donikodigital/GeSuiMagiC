//frontend/src/app/(app)/projects/[id]/quality/page.tsx
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Camera, CalendarX2, ClipboardCheck, FileCheck2, MapPin, OctagonAlert, Plus, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { Segmented } from '@/components/site/segmented';
import { SectionHeader } from '@/components/site/section-header';
import { CreateSnagDialog, SnagDetailDialog } from '@/components/site/quality/snag-dialogs';
import { ReceptionSection } from '@/components/site/quality/reception-section';
import { useSitePermissions, useSnags } from '@/hooks/use-site';
import { formatDay, snagSeverityMeta, snagStatusMeta } from '@/lib/site-format';
import type { Snag, SnagStatus } from '@/types/site';

type View = 'snags' | 'receptions';
type Filter = 'ALL' | SnagStatus;

export default function ProjectQualityPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const permissions = useSitePermissions(projectId);
  const [view, setView] = React.useState<View>('snags');
  const [filter, setFilter] = React.useState<Filter>('ALL');
  const [creating, setCreating] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const { data, isLoading, isError } = useSnags(projectId);

  const snags = data?.items ?? [];
  const selected = snags.find((s) => s.id === openId) ?? null;
  const shown = filter === 'ALL' ? snags : snags.filter((s) => s.status === filter);

  return (
    <div className="space-y-5">
      <Segmented<View>
        value={view}
        onChange={setView}
        options={[
          { value: 'snags', label: 'Réserves', icon: <OctagonAlert className="h-4 w-4" />, badge: data ? data.summary.open + data.summary.fixed : 0 },
          { value: 'receptions', label: 'Réceptions', icon: <FileCheck2 className="h-4 w-4" /> },
        ]}
      />

      {view === 'receptions' ? (
        <ReceptionSection projectId={projectId} permissions={permissions} />
      ) : isLoading ? (
        <PageSpinner />
      ) : isError || !data ? (
        <ErrorState message="Impossible de charger les réserves." />
      ) : (
        <div className="space-y-5">
          <SectionHeader
            title="Réserves et défauts"
            description="Chaque défaut constaté est suivi jusqu'à sa levée, confirmée par le client ou le responsable technique."
            action={
              permissions.contribute && (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" /> Signaler une réserve
                </Button>
              )
            }
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Ouvertes" value={String(data.summary.open)} tone={data.summary.open > 0 ? 'clay' : 'moss'} icon={<OctagonAlert className="h-4 w-4" />} />
            <StatCard label="Levées à confirmer" value={String(data.summary.fixed)} tone={data.summary.fixed > 0 ? 'safety' : 'default'} icon={<ClipboardCheck className="h-4 w-4" />} />
            <StatCard label="Échéance dépassée" value={String(data.summary.overdue)} tone={data.summary.overdue > 0 ? 'clay' : 'default'} icon={<CalendarX2 className="h-4 w-4" />} />
            <StatCard label="Critiques ouvertes" value={String(data.summary.criticalOpen)} tone={data.summary.criticalOpen > 0 ? 'clay' : 'default'} icon={<ShieldCheck className="h-4 w-4" />} />
          </div>

          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ALL', label: `Toutes (${snags.length})` },
              { value: 'OPEN', label: `Ouvertes (${data.summary.open})` },
              { value: 'FIXED', label: `À confirmer (${data.summary.fixed})` },
              { value: 'CLOSED', label: `Clôturées (${data.summary.closed})` },
            ]}
          />

          {shown.length === 0 ? (
            <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title={filter === 'ALL' ? 'Aucune réserve' : 'Aucune réserve dans cette catégorie'} description="Bonne nouvelle : rien à corriger pour l'instant." />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {shown.map((snag, i) => (
                <SnagCard key={snag.id} snag={snag} index={i} onOpen={() => setOpenId(snag.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      <CreateSnagDialog open={creating} onClose={() => setCreating(false)} projectId={projectId} />
      <SnagDetailDialog snag={selected} onClose={() => setOpenId(null)} projectId={projectId} permissions={permissions} />
    </div>
  );
}

function SnagCard({ snag, index, onOpen }: { snag: Snag; index: number; onOpen: () => void }) {
  const sev = snagSeverityMeta[snag.severity];
  const st = snagStatusMeta[snag.status];
  return (
    <button type="button" onClick={onOpen} style={{ animationDelay: `${index * 40}ms` }} className="animate-card-in text-left transition-transform hover:-translate-y-0.5">
      <Card className="h-full rounded-2xl p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-400">Réserve n°{snag.number}{snag.phaseName ? ` · ${snag.phaseName}` : ''}</p>
            <p className="truncate font-medium text-ink-900">{snag.title}</p>
          </div>
          <StatusBadge label={st.label} tone={st.tone} />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <StatusBadge label={sev.label} tone={sev.tone} />
          {snag.overdue && <StatusBadge label="En retard" tone="clay" />}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
          {snag.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {snag.location}
            </span>
          )}
          {snag.dueDate && <span>Avant le {formatDay(snag.dueDate)}</span>}
          {snag.attachments.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Camera className="h-3.5 w-3.5" /> {snag.attachments.length}
            </span>
          )}
        </div>
      </Card>
    </button>
  );
}
