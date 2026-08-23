'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { ArrowLeft, Download, FileSpreadsheet } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { formatMoney, projectStatusMeta } from '@/lib/format';
import { reportsService } from '@/services/reports.service';
import { toast } from 'sonner';

export default function ProjectDetailLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const { isClient, isSuperadmin } = useAuth();
  const { data: project, isLoading, isError } = useProject(params.id);

  if (isLoading) return <PageSpinner />;
  if (isError || !project) return <ErrorState message="Impossible de charger ce projet." />;

  const base = `/projects/${params.id}`;
  const tabs = [
    { label: 'Apercu', href: base },
    { label: 'Depots', href: `${base}/deposits` },
    { label: 'Depenses', href: `${base}/expenses` },
    { label: 'Budgets', href: `${base}/budgets` },
    { label: 'Documents', href: `${base}/documents` },
    ...(isClient || isSuperadmin ? [{ label: 'Superviseurs', href: `${base}/supervisors` }] : []),
    ...(isClient ? [{ label: 'Anomalies', href: `${base}/anomalies` }] : []),
    ...(isClient || isSuperadmin ? [{ label: 'Reglages', href: `${base}/settings` }] : []),
  ];

  const balance = parseFloat(project.wallet?.balance ?? '0');

  const handleDownload = async (type: 'pdf' | 'excel') => {
    try {
      if (type === 'pdf') await reportsService.downloadPdf(project.id, project.name);
      else await reportsService.downloadExcel(project.id, project.name);
    } catch {
      toast.error('Le telechargement a echoue.');
    }
  };

  return (
    <div>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Retour aux projets
      </Link>

      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-ink-900">{project.name}</h1>
            <StatusBadge label={projectStatusMeta[project.status].label} tone={projectStatusMeta[project.status].tone} />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {[project.location, project.city, project.country].filter(Boolean).join(', ') || 'Localisation non renseignee'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-ink-400">Solde disponible</p>
            <p className={cn('font-ledger text-lg font-semibold', balance < 0 ? 'text-clay-600' : 'text-ink-900')}>
              {formatMoney(balance, project.currency)}
            </p>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => handleDownload('pdf')} title="Exporter en PDF">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleDownload('excel')} title="Exporter en Excel">
              <FileSpreadsheet className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-6 overflow-x-auto border-b border-concrete">
        <nav className="flex gap-1 whitespace-nowrap">
          {tabs.map((tab) => {
            const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  active ? 'border-blueprint-600 text-blueprint-700' : 'border-transparent text-ink-500 hover:text-ink-800',
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
