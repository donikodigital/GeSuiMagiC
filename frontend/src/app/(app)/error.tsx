'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-clay-200 bg-clay-50 px-6 py-16 text-center">
      <AlertTriangle className="h-6 w-6 text-clay-500" />
      <div>
        <p className="font-display text-base font-semibold text-ink-800">Une erreur est survenue sur cette page</p>
        <p className="mt-1 max-w-sm text-sm text-ink-500">Vous pouvez reessayer. Si le probleme persiste, contactez le support.</p>
      </div>
      <Button onClick={reset}>Reessayer</Button>
    </div>
  );
}
