//frontend/src/hooks/use-outbox.ts
'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/auth-store';
import { flushOutbox, listOutbox, onOutboxChange, removeOutboxItem, retryOutboxItem, type OutboxItem } from '@/lib/offline/outbox';

/** Vrai tant que l'appareil a du reseau (navigator.onLine ; un reseau « branche mais mort » est gere par la file elle-meme). */
export function useOnline(): boolean {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function useOutboxItems() {
  const userId = useAuthStore((s) => s.user?.id);
  const [items, setItems] = React.useState<OutboxItem[]>([]);

  const refresh = React.useCallback(async () => {
    setItems(userId ? await listOutbox(userId) : []);
  }, [userId]);

  React.useEffect(() => {
    void refresh();
    return onOutboxChange(() => void refresh());
  }, [refresh]);

  return {
    items,
    pending: items.filter((i) => i.status === 'pending'),
    failed: items.filter((i) => i.status === 'failed'),
    retry: async (id: string) => retryOutboxItem(id),
    discard: async (id: string) => removeOutboxItem(id),
  };
}

const SYNC_INTERVAL_MS = 30_000;

/** Envoie la file hors ligne : au demarrage, au retour du reseau et toutes les 30 s tant qu'il reste des saisies. */
export function useOutboxSync() {
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!userId) return;
    let stopped = false;

    const run = async () => {
      if (stopped || !navigator.onLine) return;
      const result = await flushOutbox(userId);
      if (result.sent > 0) {
        toast.success(result.sent === 1 ? '1 saisie hors ligne envoyée.' : `${result.sent} saisies hors ligne envoyées.`);
        void queryClient.invalidateQueries();
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} saisie(s) refusée(s) par le serveur : ouvrez « Saisies hors ligne » pour les corriger.`);
      }
    };

    void run();
    const onOnline = () => void run();
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => void run(), SYNC_INTERVAL_MS);
    return () => {
      stopped = true;
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [userId, queryClient]);
}
