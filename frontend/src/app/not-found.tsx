'use client';

import Link from 'next/link';
import { HardHat } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-900 text-safety-400">
        <HardHat className="h-7 w-7" />
      </div>
      <p className="mt-6 font-ledger text-sm text-ink-400">Erreur 404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900">Cette page n&apos;existe pas</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        Le lien est peut-etre errone, ou la page a ete deplacee. Verifiez l&apos;adresse ou retournez au tableau de bord.
      </p>
      <Link href="/dashboard" className="mt-6">
        <Button>Retour au tableau de bord</Button>
      </Link>
    </div>
  );
}
