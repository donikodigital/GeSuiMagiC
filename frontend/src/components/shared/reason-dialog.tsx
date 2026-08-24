//frontend/src/components/shared/reason-dialog.tsx
'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Textarea } from '@/components/ui/input';

interface ReasonDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  isLoading?: boolean;
}

export function ReasonDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirmer', danger, isLoading }: ReasonDialogProps) {
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const handleConfirm = () => {
    if (reason.trim().length < 3) {
      setError('Merci de preciser un motif (3 caracteres minimum).');
      return;
    }
    onConfirm(reason.trim());
  };

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <FormField label="Motif" htmlFor="reason" error={error ?? undefined} required>
        <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </FormField>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={handleConfirm} loading={isLoading}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
