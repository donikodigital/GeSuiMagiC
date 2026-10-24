//frontend/src/components/site/purchasing/consumption-section.tsx
'use client';

import { Boxes } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { SectionHeader } from '@/components/site/section-header';
import { useStockConsumption } from '@/hooks/use-site';
import { formatQty, toNum } from '@/lib/site-format';

/** Consommation et pertes par etape : de quoi comparer ce qui est sorti du stock avec l'avancement. */
export function ConsumptionSection({ projectId }: { projectId: string }) {
  const { data, isLoading, isError } = useStockConsumption(projectId);
  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <ErrorState message="Impossible de charger la consommation." />;
  return (
    <div className="space-y-4">
      <SectionHeader title="Consommation par étape" description="Ce qui est sorti du stock pour chaque étape, et ce qui a été perdu. Comparez avec l'avancement pour repérer le gaspillage." />
      {data.length === 0 ? (
        <EmptyState icon={<Boxes className="h-6 w-6" />} title="Aucune consommation enregistrée" description="Sortez des matériaux du stock en indiquant l'étape qui les utilise : la consommation apparaît ici." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((phase, i) => (
            <Card key={phase.phaseId ?? 'none'} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in rounded-2xl p-4">
              <p className="font-medium text-ink-900">{phase.phaseName}</p>
              <ul className="mt-3 space-y-2">
                {phase.items.map((item) => (
                  <li key={item.stockItemId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-ink-700">{item.name}</span>
                    <span className="shrink-0 text-right font-ledger text-xs">
                      <span className="font-semibold text-ink-800">{formatQty(item.consumed)} {item.unit}</span>
                      {toNum(item.lost) > 0 && <span className="ml-2 text-clay-600">dont {formatQty(item.lost)} perdu</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
