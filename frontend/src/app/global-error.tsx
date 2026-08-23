'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-clay-50 text-clay-500">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="mt-6 font-display text-2xl font-semibold text-ink-900">Une erreur est survenue</h1>
          <p className="mt-2 max-w-sm text-sm text-ink-500">
            Quelque chose s&apos;est mal passe de notre cote. Vous pouvez reessayer, aucune donnee n&apos;a ete perdue.
          </p>
          <Button className="mt-6" onClick={reset}>
            Reessayer
          </Button>
        </div>
      </body>
    </html>
  );
}
