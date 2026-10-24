//frontend/src/app/(app)/projects/[id]/journal/page.tsx
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { BookOpenText, ChevronLeft, ChevronRight, Cloud, CloudRain, CloudRainWind, MapPin, MapPinOff, Plus, Search, Sun, Wind } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { PhaseSelect } from '@/components/site/phase-select';
import { PhotoGallery } from '@/components/site/photo-gallery';
import { SiteLogDialog } from '@/components/site/journal/site-log-dialog';
import { useSiteLogs, useSitePermissions } from '@/hooks/use-site';
import { formatDateTime } from '@/lib/format';
import { formatDay, weatherLabels } from '@/lib/site-format';
import type { WeatherCondition } from '@/types/site';

const weatherIcon: Record<WeatherCondition, typeof Sun> = { SUNNY: Sun, CLOUDY: Cloud, RAIN: CloudRain, HEAVY_RAIN: CloudRainWind, WINDY: Wind };

export default function ProjectJournalPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const permissions = useSitePermissions(projectId);
  const [page, setPage] = React.useState(1);
  const [phaseId, setPhaseId] = React.useState('');
  const [searchInput, setSearchInput] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, isFetching } = useSiteLogs(projectId, { page, phaseId: phaseId || undefined, search: search || undefined });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-500">Le journal garde la mémoire du chantier : chaque jour, ce qui a été fait, la météo, les problèmes et les photos horodatées. Il fonctionne même sans réseau.</p>
        {permissions.writeLog && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nouvelle entrée
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <Input className="pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Rechercher dans le journal…" />
        </div>
        <PhaseSelect projectId={projectId} value={phaseId} onChange={(v) => { setPhaseId(v); setPage(1); }} emptyLabel="Toutes les étapes" />
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : isError || !data ? (
        <ErrorState message="Impossible de charger le journal." />
      ) : data.items.length === 0 ? (
        <EmptyState icon={<BookOpenText className="h-6 w-6" />} title={search || phaseId ? 'Aucune entrée trouvée' : 'Le journal est vide'} description={search || phaseId ? 'Modifiez la recherche ou le filtre.' : 'Les entrées du superviseur, du conducteur de travaux et de l’architecte apparaîtront ici.'} />
      ) : (
        <div className={isFetching ? 'space-y-3 opacity-70 transition-opacity' : 'space-y-3'}>
          {data.items.map((log, i) => {
            const WeatherIcon = log.weather ? weatherIcon[log.weather] : null;
            return (
              <Card key={log.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in rounded-2xl p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blueprint-600">{formatDay(log.date, 'EEEE d MMMM yyyy')}</p>
                    <h3 className="mt-0.5 font-display text-base font-semibold text-ink-900">{log.title}</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {WeatherIcon && log.weather && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blueprint-50 px-2.5 py-1 text-xs font-medium text-blueprint-700">
                        <WeatherIcon className="h-3.5 w-3.5" /> {weatherLabels[log.weather]}
                      </span>
                    )}
                    {log.phaseName && <StatusBadge label={log.phaseName} tone="ink" />}
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">{log.content}</p>
                {log.attachments.length > 0 && (
                  <div className="mt-3">
                    <PhotoGallery attachments={log.attachments} />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-concrete pt-2.5 text-xs text-ink-400">
                  <span>
                    {log.authorName ?? 'Auteur inconnu'} · {formatDateTime(log.createdAt)}
                  </span>
                  {log.latitude && log.longitude ? (
                    log.isOffSite ? (
                      <span className="inline-flex items-center gap-1 text-clay-600">
                        <MapPinOff className="h-3.5 w-3.5" /> Saisi hors du chantier
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-moss-600">
                        <MapPin className="h-3.5 w-3.5" /> Saisi sur le chantier
                      </span>
                    )
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" /> Précédent
          </Button>
          <span className="text-sm text-ink-500">
            Page {data.meta.page} sur {data.meta.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>
            Suivant <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <SiteLogDialog open={creating} onClose={() => setCreating(false)} projectId={projectId} />
    </div>
  );
}
