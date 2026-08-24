//frontend/src/components/shared/correction-dialog.tsx
'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input, Textarea } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';

interface CorrectionDialogProps {
  open: boolean;
  onClose: () => void;
  currentAmount: string;
  currency: string;
  onConfirm: (newAmount: number, reason: string) => void;
  isLoading?: boolean;
}

/**
 * Correction administrative (section 16/53) : l'ancienne valeur reste
 * visible dans l'historique/audit - ce formulaire ne "remplace" jamais
 * silencieusement, il cree une nouvelle ecriture de correction.
 */
export function CorrectionDialog({ open, onClose, currentAmount, currency, onConfirm, isLoading }: CorrectionDialogProps) {
  const [newAmount, setNewAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setNewAmount(currentAmount);
      setReason('');
      setError(null);
    }
  }, [open, currentAmount]);

  const handleConfirm = () => {
    const amount = Number(newAmount);
    if (!amount || amount <= 0) {
      setError('Le nouveau montant doit etre superieur a 0.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Un motif est obligatoire.');
      return;
    }
    onConfirm(amount, reason.trim());
  };

  return (
    <Dialog open={open} onClose={onClose} title="Correction administrative" description="Cette action est tracee dans le journal d'audit et reste consultable a tout moment.">
      <div className="mb-4 rounded-md bg-paper px-3 py-2 text-sm text-ink-500">
        Montant actuel : <span className="font-ledger font-medium text-ink-800">{formatMoney(currentAmount, currency)}</span>
      </div>
      <div className="space-y-4">
        <FormField label="Nouveau montant" htmlFor="newAmount" required>
          <Input id="newAmount" type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
        </FormField>
        <FormField label="Motif de la correction" htmlFor="reason" error={error ?? undefined} required>
          <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Erreur de saisie, justificatif corrige..." />
        </FormField>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleConfirm} loading={isLoading}>
          Appliquer la correction
        </Button>
      </div>
    </Dialog>
  );
}
