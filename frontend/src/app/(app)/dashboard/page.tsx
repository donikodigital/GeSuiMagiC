//frontend/src/app/(app)/dashboard/page.tsx
// ============================================================================
// app/dashboard/page.tsx - v2.0
// PageHeader retire : chaque *Dashboard porte maintenant son propre
// DashboardHero (titre + sous-titre + solde), le doublon de titre est evite.
// ============================================================================

'use client';

import { useAuth } from '@/hooks/use-auth';
import { ClientDashboard } from '@/components/dashboard/client-dashboard';
import { SupervisorDashboard } from '@/components/dashboard/supervisor-dashboard';
import { SuperadminDashboard } from '@/components/dashboard/superadmin-dashboard';

export default function DashboardPage() {
  const { isSuperadmin, isClient, isSupervisor } = useAuth();

  return (
    <div>
      {isSuperadmin && <SuperadminDashboard />}
      {isClient && <ClientDashboard />}
      {isSupervisor && <SupervisorDashboard />}
    </div>
  );
}