//frontend/src/components/messages/message-thread-dialog.tsx
'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';
import { MESSAGE_STATUS_META, MESSAGE_TYPE_LABELS, messageParticipantLabel } from './message-card';
import type { Message, MessageStatus } from '@/types/models';

interface MessageThreadDialogProps {
  open: boolean;
  onClose: () => void;
  message: Message;
  currentUserId?: string;
  isSuperadmin: boolean;
  /** `recipientId` n'est renseigne que pour une reponse PRIVEE du superadmin dans un fil de diffusion. */
  onReply: (body: string, recipientId?: string) => void;
  onStatusChange?: (status: MessageStatus) => void;
  isReplying?: boolean;
  isChangingStatus?: boolean;
}

export function MessageThreadDialog({
  open,
  onClose,
  message,
  currentUserId,
  isSuperadmin,
  onReply,
  onStatusChange,
  isReplying,
}: MessageThreadDialogProps) {
  const [replyBody, setReplyBody] = React.useState('');
  // '' = reponse publique (tous les destinataires de la diffusion) ; sinon id de l'utilisateur cible.
  const [privateRecipientId, setPrivateRecipientId] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (open) {
      setReplyBody('');
      setPrivateRecipientId('');
    }
  }, [open, message.id]);

  const allMessages = [message, ...(message.replies ?? [])];

  // Fil de diffusion generale : le superadmin peut repondre a tous (public) ou en prive a un client qui a ecrit.
  const isGlobalBroadcast = message.type === 'BROADCAST' && !message.recipientId;
  const canChooseRecipient = isSuperadmin && isGlobalBroadcast;

  const repliers = React.useMemo(() => {
    const byId = new Map<string, string>();
    (message.replies ?? []).forEach((m) => {
      if (m.senderId !== currentUserId && !byId.has(m.senderId)) byId.set(m.senderId, messageParticipantLabel(m.sender));
    });
    return Array.from(byId, ([id, label]) => ({ id, label }));
  }, [message.replies, currentUserId]);

  const labelOf = (userId?: string | null) => repliers.find((r) => r.id === userId)?.label ?? 'un client';

  const startPrivateReply = (userId: string) => {
    setPrivateRecipientId(userId);
    textareaRef.current?.focus();
  };

  const submit = () => {
    const body = replyBody.trim();
    if (!body) return;
    onReply(body, canChooseRecipient && privateRecipientId ? privateRecipientId : undefined);
    setReplyBody('');
  };

  return (
    <Dialog open={open} onClose={onClose} title={message.subject} maxWidth="max-w-xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge label={MESSAGE_TYPE_LABELS[message.type]} tone="blueprint" />
        {isSuperadmin && onStatusChange ? (
          <Select value={message.status} onChange={(e) => onStatusChange(e.target.value as MessageStatus)} className="h-8 w-40 text-xs">
            {(Object.keys(MESSAGE_STATUS_META) as MessageStatus[]).map((s) => (
              <option key={s} value={s}>
                {MESSAGE_STATUS_META[s].label}
              </option>
            ))}
          </Select>
        ) : (
          <StatusBadge label={MESSAGE_STATUS_META[message.status].label} tone={MESSAGE_STATUS_META[message.status].tone} />
        )}
      </div>

      <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
        {allMessages.map((m) => {
          const isMine = m.senderId === currentUserId;
          const isPrivateFromMe = canChooseRecipient && isMine && !!m.recipientId && m.id !== message.id;
          const canAnswerPrivately = canChooseRecipient && !isMine && m.id !== message.id;
          return (
            <div key={m.id} className={`rounded-card border p-3.5 ${isMine ? 'border-blueprint-200 bg-blueprint-50/40' : 'border-concrete bg-paper'}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-700">
                  {isMine ? 'Vous' : messageParticipantLabel(m.sender)}
                  {isPrivateFromMe && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-normal text-ink-500">
                      <Lock className="h-3 w-3" /> Privé · {labelOf(m.recipientId)}
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-ink-400">{formatDateTime(m.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink-800">{m.body}</p>
              {canAnswerPrivately && (
                <button
                  type="button"
                  onClick={() => startPrivateReply(m.senderId)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blueprint-600 hover:underline"
                >
                  <Lock className="h-3 w-3" /> Répondre en privé
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-2 border-t border-concrete pt-4">
        {canChooseRecipient && (
          <div className="space-y-1">
            <label htmlFor="reply-recipient" className="text-xs font-medium text-ink-600">
              Destinataire de la réponse
            </label>
            <Select id="reply-recipient" value={privateRecipientId} onChange={(e) => setPrivateRecipientId(e.target.value)}>
              <option value="">Tous les destinataires de la diffusion (public)</option>
              {repliers.map((r) => (
                <option key={r.id} value={r.id}>
                  Privé : {r.label}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-ink-400">
              {privateRecipientId
                ? `Seul ${labelOf(privateRecipientId)} verra cette réponse.`
                : 'Cette réponse sera visible par tous les clients qui ont reçu la diffusion.'}
            </p>
          </div>
        )}
        <Textarea
          ref={textareaRef}
          rows={3}
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder={canChooseRecipient && privateRecipientId ? `Réponse privée à ${labelOf(privateRecipientId)}...` : 'Ecrire une reponse...'}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={submit} loading={isReplying} disabled={replyBody.trim().length < 1}>
            {canChooseRecipient && privateRecipientId ? 'Répondre en privé' : 'Repondre'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}