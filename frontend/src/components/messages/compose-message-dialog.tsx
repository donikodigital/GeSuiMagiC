// frontend/src/components/messages/compose-message-dialog.tsx
'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { clientsService } from '@/services/clients.service';
import type { CreateMessagePayload } from '@/services/messages.service';
import type { MessageType } from '@/types/models';
import { MESSAGE_TYPE_LABELS } from './message-card';

interface ComposeMessageDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateMessagePayload) => void;
  isLoading?: boolean;
  isSuperadmin: boolean;
  defaultValues?: Partial<CreateMessagePayload>;
}

const CLIENT_TYPES: MessageType[] = ['MODIFICATION_REQUEST', 'DELETION_REQUEST', 'ARCHIVE_REQUEST', 'OTHER'];
const ALL_CLIENTS_VALUE = '__all__';

export function ComposeMessageDialog({ open, onClose, onSubmit, isLoading, isSuperadmin, defaultValues }: ComposeMessageDialogProps) {
  const [type, setType] = React.useState<MessageType>('OTHER');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [recipient, setRecipient] = React.useState<string>(ALL_CLIENTS_VALUE);

  const clientsQuery = useQuery({
    queryKey: ['clients', 'select-list'],
    queryFn: () => clientsService.list(1, 200),
    enabled: open && isSuperadmin,
  });

  React.useEffect(() => {
    if (open) {
      setType(defaultValues?.type ?? (isSuperadmin ? 'OTHER' : 'MODIFICATION_REQUEST'));
      setSubject(defaultValues?.subject ?? '');
      setBody(defaultValues?.body ?? '');
      setRecipient(defaultValues?.recipientId ?? ALL_CLIENTS_VALUE);
    }
  }, [open, defaultValues, isSuperadmin]);

  const handleSubmit = () => {
    if (isSuperadmin) {
      const broadcasting = recipient === ALL_CLIENTS_VALUE;
      onSubmit({
        type: broadcasting ? 'BROADCAST' : type,
        subject,
        body,
        recipientId: broadcasting ? undefined : recipient,
        relatedEntityType: defaultValues?.relatedEntityType,
        relatedEntityId: defaultValues?.relatedEntityId,
      });
    } else {
      onSubmit({
        type,
        subject,
        body,
        relatedEntityType: defaultValues?.relatedEntityType,
        relatedEntityId: defaultValues?.relatedEntityId,
      });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isSuperadmin ? 'Nouveau message' : 'Contacter le superadministrateur'}
      description={
        isSuperadmin
          ? 'Envoyez un message a un client precis ou diffusez-le a tous les clients. Un email est envoye en parallele de la notification.'
          : "Votre demande sera transmise a l'equipe superadmin, avec un email envoye en parallele."
      }
    >
      <div className="space-y-4">
        {isSuperadmin && (
          <FormField label="Destinataire" htmlFor="msg-recipient" required>
            <Select id="msg-recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
              <option value={ALL_CLIENTS_VALUE}>Tous les clients (diffusion)</option>
              {clientsQuery.data?.items.map((c) => (
                <option key={c.id} value={c.userId}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        {!isSuperadmin && (
          <FormField label="Type de demande" htmlFor="msg-type" required>
            <Select id="msg-type" value={type} onChange={(e) => setType(e.target.value as MessageType)}>
              {CLIENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MESSAGE_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        <FormField label="Sujet" htmlFor="msg-subject" required>
          <Input id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex: Demande de correction du depot du 12 mai" />
        </FormField>

        <FormField label="Message" htmlFor="msg-body" required>
          <Textarea id="msg-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Decrivez votre demande en detail..." />
        </FormField>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} loading={isLoading} disabled={!subject.trim() || body.trim().length < 3}>
          Envoyer
        </Button>
      </div>
    </Dialog>
  );
}