// ============================================================================
// hooks/use-nav-items.ts - v1.1
// Seul changement : le "Reglages" du superadmin (parametres globaux de la
// plateforme) devient "Parametres de securite", pour ne plus entrer en
// collision avec le nouveau "Reglages" contextuel du chantier ajoute dans
// topbar.tsx (menu burger, section "Chantier en cours").
// ============================================================================

import { Building2, HardHat, LayoutDashboard, Package, ScrollText, Settings, ShieldAlert, Users } from 'lucide-react';
import { useAuth } from './use-auth';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function useNavItems(): NavItem[] {
  const { isSuperadmin, isClient, isSupervisor } = useAuth();

  const commonItems: NavItem[] = [{ label: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard }];

  const superadminItems: NavItem[] = [
    { label: 'Clients', href: '/clients', icon: Building2 },
    { label: 'Projets', href: '/projects', icon: HardHat },
    { label: 'Catalogue', href: '/materials', icon: Package },
    { label: 'Anomalies', href: '/anomalies', icon: ShieldAlert },
    { label: "Journal d'audit", href: '/audit', icon: ScrollText },
    { label: 'Parametres de securite', href: '/settings', icon: Settings },
  ];

  const clientItems: NavItem[] = [
    { label: 'Mes projets', href: '/projects', icon: HardHat },
    { label: 'Superviseurs', href: '/supervisors', icon: Users },
  ];

  const supervisorItems: NavItem[] = [{ label: 'Mes projets', href: '/projects', icon: HardHat }];

  return [...commonItems, ...(isSuperadmin ? superadminItems : []), ...(isClient ? clientItems : []), ...(isSupervisor ? supervisorItems : [])];
}