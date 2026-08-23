'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HardHatIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useNavItems } from '@/hooks/use-nav-items';

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const items = useNavItems();


  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900 text-white lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-ink-800 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-safety-400 text-ink-900">
          <HardHatIcon className="h-4.5 w-4.5" />
        </div>
        <span className="font-display text-base font-semibold">Suivi de Chantier</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-blueprint-700/60 text-white' : 'text-ink-300 hover:bg-ink-800 hover:text-white',
              )}
            >
              <Icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-800 px-4 py-4">
        <p className="truncate text-xs text-ink-400">{user?.email}</p>
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-safety-400">{roleLabel(user?.role)}</p>
      </div>
    </aside>
  );
}

function roleLabel(role?: string) {
  switch (role) {
    case 'SUPERADMIN':
      return 'Superadmin';
    case 'CLIENT':
      return 'Client';
    case 'SUPERVISOR':
      return 'Superviseur';
    default:
      return '';
  }
}
