// frontend/src/app/(app)/contact/page.tsx
'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useMessages, useCreateMessage, useReplyMessage, useUpdateMessageStatus, useMarkMessageAsRead } from '@/hooks/use-messages';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { PageSpinner, ErrorState, EmptyState } from '@/components/ui/misc';
import { MessageCard } from '@/components/messages/message-card';
import { ComposeMessageDialog } from '@/components/messages/compose-message-dialog';
import { MessageThreadDialog } from '@/components/messages/message-thread-dialog';
import { RequireRole } from '@/components/shared/require-role';
import type { Message, MessageStatus } from '@/types/models';

function ContactPageContent() {
  const { user, isSuperadmin } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<MessageStatus | ''>('');
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Message | null>(null);

  const { data, isLoading, isError } = useMessages({ status: status || undefined });
  const createMutation = useCreateMessage();
  const replyMutation = useReplyMessage();
  const statusMutation = useUpdateMessageStatus();
  const markReadMutation = useMarkMessageAsRead();

  const openThread = (message: Message) => {
    setSelected(message);
    if (!message.isRead && message.senderId !== user?.id) {
      markReadMutation.mutate(message.id);
    }
  };

  return (
    <div>
      <PageHeader
        title="Contact"
        description={
          isSuperadmin
            ? 'Echangez avec vos clients : demandes de modification, suppression ou archivage, et diffusions groupées.'
            : 'Contactez le superadministrateur pour toute demande de modification, suppression ou archivage sur un dépôt ou une dépense.'
        }
        actions={
          <Button onClick={() => setComposeOpen(true)}>
            <Plus className="h-4 w-4" /> {isSuperadmin ? 'Nouveau message' : 'Nouvelle demande'}
          </Button>
        }
      />

      <div className="mb-4 max-w-xs">
        <Select value={status} onChange={(e) => setStatus(e.target.value as MessageStatus | '')}>
          <option value="">Tous les statuts</option>
          <option value="OPEN">Ouverts</option>
          <option value="IN_PROGRESS">En cours</option>
          <option value="RESOLVED">Resolus</option>
          <option value="CLOSED">Fermés</option>
        </Select>
      </div>

      {isError ? (
        <ErrorState message="Impossible de charger les messages." />
      ) : isLoading ? (
        <PageSpinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title="Aucun message"
          description={isSuperadmin ? 'Aucune demande client pour le moment.' : "Vous n'avez pas encore contacté le superadministrateur."}
        />
      ) : (
        <div className="space-y-3">
          {(data?.items ?? []).map((message) => (
            <MessageCard key={message.id} message={message} currentUserId={user?.id} onClick={() => openThread(message)} />
          ))}
        </div>
      )}

      <ComposeMessageDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        isSuperadmin={isSuperadmin}
        isLoading={createMutation.isPending}
        onSubmit={(payload) => createMutation.mutate(payload, { onSuccess: () => setComposeOpen(false) })}
      />

      {selected && (
        <MessageThreadDialog
          open
          onClose={() => setSelected(null)}
          message={selected}
          currentUserId={user?.id}
          isSuperadmin={isSuperadmin}
          isReplying={replyMutation.isPending}
          onReply={(body) => {
            replyMutation.mutate(
              { id: selected.id, body },
              {
                onSuccess: (updated) => {
                  setSelected(updated);
                  queryClient.invalidateQueries({ queryKey: ['messages'] });
                },
              },
            );
          }}
          onStatusChange={(newStatus) => {
            statusMutation.mutate({ id: selected.id, status: newStatus }, { onSuccess: (updated) => setSelected(updated) });
          }}
        />
      )}
    </div>
  );
}

export default function ContactPage() {
  return (
    <RequireRole roles={['CLIENT', 'SUPERADMIN']}>
      <ContactPageContent />
    </RequireRole>
  );
}