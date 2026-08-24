//frontend/src/components/layout/notifications-panel.tsx
'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { notificationsService } from '@/services/notifications.service';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/misc';

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'panel'],
    queryFn: () => notificationsService.list(1, 10),
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsService.markAllAsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsService.markAsRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 z-50 mt-2 w-80 rounded-card border border-concrete bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-concrete px-4 py-3">
          <p className="font-display text-sm font-semibold text-ink-900">Notifications</p>
          <button
            onClick={() => markAllRead.mutate()}
            className="flex items-center gap-1 text-xs text-blueprint-600 hover:underline"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Tout marquer lu
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isLoading && <p className="px-4 py-6 text-center text-sm text-ink-400">Chargement...</p>}
          {!isLoading && data?.items.length === 0 && (
            <div className="px-4 py-6">
              <EmptyState title="Aucune notification" />
            </div>
          )}
          {data?.items.map((n) => (
            <button
              key={n.id}
              onClick={() => markRead.mutate(n.id)}
              className={cn(
                'block w-full border-b border-concrete px-4 py-3 text-left last:border-0 hover:bg-paper',
                !n.isRead && 'bg-blueprint-50/50',
              )}
            >
              <p className="text-sm font-medium text-ink-900">{n.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{n.message}</p>
              <p className="mt-1 text-[11px] text-ink-400">{formatRelative(n.createdAt)}</p>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
