// frontend/src/components/messages/message-card.tsx
'use client';

import { Archive, ChevronRight, MessageCircle, Megaphone, Pencil, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { formatRelative } from '@/lib/format';
import type { Message, MessageStatus, MessageType } from '@/types/models';

export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  MODIFICATION_REQUEST: 'Demande de modification',
  DELETION_REQUEST: 'Demande de suppression',
  ARCHIVE_REQUEST: "Demande d'archivage",
  OTHER: 'Autre demande',
  BROADCAST: 'Diffusion',
};

const MESSAGE_TYPE_ICON: Record<MessageType, React.ComponentType<{ className?: string }>> = {
  MODIFICATION_REQUEST: Pencil,
  DELETION_REQUEST: Trash2,
  ARCHIVE_REQUEST: Archive,
  OTHER: MessageCircle,
  BROADCAST: Megaphone,
};

type Tone = 'moss' | 'safety' | 'clay' | 'ink' | 'blueprint';

const MESSAGE_TYPE_TONE: Record<MessageType, Tone> = {
  MODIFICATION_REQUEST: 'blueprint',
  DELETION_REQUEST: 'clay',
  ARCHIVE_REQUEST: 'safety',
  OTHER: 'ink',
  BROADCAST: 'moss',
};

export const MESSAGE_STATUS_META: Record<MessageStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Ouvert', tone: 'safety' },
  IN_PROGRESS: { label: 'En cours', tone: 'blueprint' },
  RESOLVED: { label: 'Resolu', tone: 'moss' },
  CLOSED: { label: 'Ferme', tone: 'ink' },
};

const TONE_ICON_BG: Record<Tone, string> = {
  moss: 'bg-moss-50 text-moss-600',
  safety: 'bg-safety-50 text-safety-500',
  clay: 'bg-clay-50 text-clay-600',
  ink: 'bg-ink-50 text-ink-600',
  blueprint: 'bg-blueprint-50 text-blueprint-700',
};

export function messageParticipantLabel(
  participant?: { email: string; role?: string; clientProfile?: { firstName: string; lastName: string } | null } | null,
): string {
  if (!participant) return 'Equipe';
  if (participant.clientProfile) return `${participant.clientProfile.firstName} ${participant.clientProfile.lastName}`;
  if (participant.role === 'SUPERADMIN') return 'Superadministrateur';
  return participant.email;
}

export function MessageCard({ message, currentUserId, onClick }: { message: Message; currentUserId?: string; onClick: () => void }) {
  const tone = MESSAGE_TYPE_TONE[message.type];
  const Icon = MESSAGE_TYPE_ICON[message.type];
  const isMine = message.senderId === currentUserId;
  const replyCount = message.replies?.length ?? 0;
  const lastActivity = replyCount > 0 ? message.replies![replyCount - 1].createdAt : message.createdAt;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-card border border-concrete bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-blueprint-200 hover:shadow-md active:translate-y-0"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONE_ICON_BG[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className={`truncate font-medium ${!message.isRead && !isMine ? 'text-ink-900' : 'text-ink-700'}`}>{message.subject}</p>
          <StatusBadge label={MESSAGE_STATUS_META[message.status].label} tone={MESSAGE_STATUS_META[message.status].tone} className="shrink-0" />
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-ink-600">{message.body}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-400">
          <span>{isMine ? 'Vous' : messageParticipantLabel(message.sender)}</span>
          <span className="text-ink-300">·</span>
          <span>{MESSAGE_TYPE_LABELS[message.type]}</span>
          <span className="text-ink-300">·</span>
          <span>{formatRelative(lastActivity)}</span>
          {replyCount > 0 && (
            <>
              <span className="text-ink-300">·</span>
              <span>
                {replyCount} réponse{replyCount > 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>
      </div>

      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blueprint-500" />
    </button>
  );
}