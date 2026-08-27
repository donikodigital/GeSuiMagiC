// frontend/src/components/messages/message-thread-dialog.tsx
'use client';

import * as React from 'react';
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
  onReply: (body: string) => void;
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

  React.useEffect(() => {
    if (open) setReplyBody('');
  }, [open, message.id]);

  const allMessages = [message, ...(message.replies ?? [])];

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
          return (
            <div key={m.id} className={`rounded-card border p-3.5 ${isMine ? 'border-blueprint-200 bg-blueprint-50/40' : 'border-concrete bg-paper'}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink-700">{isMine ? 'Vous' : messageParticipantLabel(m.sender)}</span>
                <span className="text-[11px] text-ink-400">{formatDateTime(m.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink-800">{m.body}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-2 border-t border-concrete pt-4">
        <Textarea rows={3} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Ecrire une reponse..." />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button
            onClick={() => {
              onReply(replyBody.trim());
              setReplyBody('');
            }}
            loading={isReplying}
            disabled={replyBody.trim().length < 1}
          >
            Repondre
          </Button>
        </div>
      </div>
    </Dialog>
  );
}