// frontend/src/components/projects/project-tab-cards.tsx
// v1.2 - passage a 4 cartes par ligne (au lieu de 3) sur demande.
// Resserrement supplementaire pour cette largeur de carte encore plus
// reduite (~95px sur 401px) : icone h-8w-8 -> h-7w-7, texte 11px -> 10px,
// padding p-2.5 -> p-2, gap de la grille 2 -> 1.5. line-clamp-2 conserve
// pour "Superviseurs"/"Reglages". Aucun autre changement (animation,
// etat actif, comportement au tap identiques).

'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProjectTabCardItem {
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
}

export function ProjectTabCards({ tabs }: { tabs: ProjectTabCardItem[] }) {
  return (
    <div className="mb-6 grid grid-cols-4 gap-1.5 sm:hidden">
      {tabs.map((tab, i) => {
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{ animationDelay: `${i * 40}ms` }}
            className={cn(
              'animate-card-in flex flex-col items-center gap-1 rounded-xl border p-2 text-center shadow-card transition-transform duration-150 active:scale-95',
              tab.active
                ? 'border-blueprint-700 bg-blueprint-700'
                : 'border-concrete bg-white hover:-translate-y-0.5 hover:border-blueprint-200 hover:shadow-md',
            )}
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                tab.active ? 'bg-white/15 text-white' : 'bg-blueprint-50 text-blueprint-600',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className={cn('line-clamp-2 text-[10px] font-medium leading-tight', tab.active ? 'text-white' : 'text-ink-800')}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}