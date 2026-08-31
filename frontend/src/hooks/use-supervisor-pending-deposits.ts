// frontend/src/hooks/use-supervisor-pending-deposits.ts
'use client';

import { useQueries } from '@tanstack/react-query';
import { depositsService } from '@/services/deposits.service';
import type { Project } from '@/types/models';

/**
 * Agrege les depots en attente sur tous les chantiers affectes au
 * superviseur. Une requete par chantier (nombre de chantiers reste faible
 * en pratique), combinees en un seul resultat exploitable par le tableau
 * de bord.
 */
export function useSupervisorPendingDeposits(projects: Project[]) {
  const queries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ['deposits', project.id, { status: 'PENDING', limit: 50 }],
      queryFn: () => depositsService.listForProject(project.id, { status: 'PENDING', limit: 50 }),
      enabled: !!project.id,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const items = queries.flatMap((q) => q.data?.items ?? []);
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  return {
    isLoading,
    items,
    totalCount: items.length,
    totalAmount: items.reduce((sum, d) => sum + parseFloat(d.amount), 0),
    currency: items[0]?.currency ?? projects[0]?.currency ?? 'GNF',
    projectNameById,
  };
}