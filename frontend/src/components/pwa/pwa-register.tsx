//frontend/src/components/pwa/pwa-register.tsx
'use client';

import * as React from 'react';
import { registerServiceWorker } from '@/lib/offline/sw';

/** Enregistre le service worker (fonctionnement hors ligne) une fois l'application chargee. */
export function PwaRegister() {
  React.useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
