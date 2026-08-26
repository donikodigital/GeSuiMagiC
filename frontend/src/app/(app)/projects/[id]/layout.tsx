// ============================================================================
// app/(app)/projects/[id]/layout.tsx - v1.2
// Ajout des onglets Documents / Superviseurs / Anomalies / Reglages a la
// barre d'onglets desktop - ils n'existaient jusqu'ici que dans le tiroir
// mobile (section "Chantier en cours" de topbar.tsx v1.2), rendant ces
// pages inaccessibles depuis un ecran large. Meme gating par role que
// topbar.tsx, pour rester coherent entre les deux surfaces :
// - Documents : tous roles
// - Superviseurs : Client ou Superadmin
// - Anomalies : Client uniquement
// - Reglages (du projet) : Client ou Superadmin
// Barre d'onglets deja en overflow-x-auto (gere le cas ou 8 onglets
// depassent la largeur sur les ecrans plus etroits). Aucun changement sur
// l'en-tete navy, les telechargements PDF/Excel, ou le garde de chargement.
// ============================================================================

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
  const { data: project, isLoading, isError } = useProject(params.id);
  const { isClient, isSuperadmin } = useAuth();

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

      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B1330] via-[#122057] to-[#1B2E6E] px-5 py-5 sm:px-7 sm:py-6">
        <svg
          aria-hidden="true"
          viewBox="0 0 160 160"
          className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 opacity-[0.08] sm:h-40 sm:w-40"
        >
          <circle cx="80" cy="80" r="64" fill="none" stroke="#E7D9AE" strokeWidth="1" strokeDasharray="2 6" />
          <circle cx="80" cy="80" r="46" fill="none" stroke="#E7D9AE" strokeWidth="1" />
        </svg>

        <div className="relative flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate font-display text-xl font-semibold text-white sm:text-2xl">{project.name}</h1>
              <StatusBadge label={projectStatusMeta[project.status].label} tone={projectStatusMeta[project.status].tone} />
            </div>
            <p className="mt-1 truncate text-sm text-white/60">
              {[project.location, project.city, project.country].filter(Boolean).join(', ') || 'Localisation non renseignee'}
            </p>
          </div>

          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-white/50">Solde disponible</p>
              <p className={cn('font-ledger text-xl font-bold sm:text-2xl', balance < 0 ? 'text-[#FFB4A2]' : 'text-white')}>
                {formatMoney(balance, project.currency)}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 text-white hover:bg-white/10"
                onClick={() => handleDownload('pdf')}
                title="Exporter en PDF"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 text-white hover:bg-white/10"
                onClick={() => handleDownload('excel')}
                title="Exporter en Excel"
              >
                <FileSpreadsheet className="h-4 w-4" />
              </Button>
            </div>
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