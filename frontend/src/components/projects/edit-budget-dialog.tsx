// frontend/src/components/projects/edit-budget-dialog.tsx
'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';

interface EditBudgetDialogProps {
  open: boolean;
  onClose: () => void;
  currentBudget: string;
  currency: string;
  onConfirm: (newBudget: number) => void;
  isLoading?: boolean;
}

export function EditBudgetDialog({ open, onClose, currentBudget, currency, onConfirm, isLoading }: EditBudgetDialogProps) {
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setValue(currentBudget);
      setError(null);
    }
  }, [open, currentBudget]);

  const handleConfirm = () => {
    const amount = Number(value);
    if (!amount || amount <= 0) {
      setError('Le budget doit etre superieur a 0.');
      return;
    }
    onConfirm(amount);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Modifier le budget" description="Ce montant sert de reference pour le suivi financier du chantier.">
      <div className="mb-4 rounded-md bg-paper px-3 py-2 text-sm text-ink-500">
        Budget actuel : <span className="font-ledger font-medium text-ink-800">{formatMoney(currentBudget, currency)}</span>
      </div>
      <FormField label="Nouveau budget" htmlFor="budget-value" required error={error ?? undefined}>
        <Input
          id="budget-value"
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="font-ledger text-base font-semibold"
        />
      </FormField>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Fermer
        </Button>
        <Button onClick={handleConfirm} loading={isLoading}>
          Modifier
        </Button>
      </div>
    </Dialog>
  );
}