// frontend/src/hooks/use-nav-items.ts - v1.2
// Ajout de "Parametres de securite" (route /settings) pour le client et le
// superviseur - jusque-la reserve au superadmin dans la nav, alors que la
// page /settings n'a aucun RequireRole et gerait deja le changement de mot
// de passe pour tous les roles. Ajout de "Catalogue" (route /materials)
// pour le client, qui peut desormais y ajouter des elements comme le
// superadmin (voir categories/materials/units.controller.ts).

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
    { label: 'Catalogue', href: '/materials', icon: Package },
    { label: 'Parametres de securite', href: '/settings', icon: Settings },
  ];

  const supervisorItems: NavItem[] = [
    { label: 'Mes projets', href: '/projects', icon: HardHat },
    { label: 'Parametres de securite', href: '/settings', icon: Settings },
  ];

  return [...commonItems, ...(isSuperadmin ? superadminItems : []), ...(isClient ? clientItems : []), ...(isSupervisor ? supervisorItems : [])];
}