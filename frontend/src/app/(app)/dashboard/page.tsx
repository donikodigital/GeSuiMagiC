'use client';

import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/shared/page-header';
import { ClientDashboard } from '@/components/dashboard/client-dashboard';
import { SupervisorDashboard } from '@/components/dashboard/supervisor-dashboard';
import { SuperadminDashboard } from '@/components/dashboard/superadmin-dashboard';

export default function DashboardPage() {
  const { isSuperadmin, isClient, isSupervisor, user } = useAuth();

  return (
    <div>
      <PageHeader title="Tableau de bord" description={greeting(user?.role)} />
      {isSuperadmin && <SuperadminDashboard />}
      {isClient && <ClientDashboard />}
      {isSupervisor && <SupervisorDashboard />}
    </div>
  );
}

function greeting(role?: string) {
  switch (role) {
    case 'SUPERADMIN':
      return 'Vue d\'ensemble de la plateforme.';
    case 'CLIENT':
      return 'Vue d\'ensemble de vos chantiers.';
    case 'SUPERVISOR':
      return 'Vos chantiers affectes.';
    default:
      return undefined;
  }
}
