// frontend/src/components/deposits/edit-deposit-dialog.tsx
'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { paymentMethodLabels } from '@/lib/format';
import type { Deposit, PaymentMethod } from '@/types/models';

interface EditDepositDialogProps {
  open: boolean;
  onClose: () => void;
  deposit: Deposit;
  onConfirm: (payload: {
    amount?: number;
    date?: string;
    motif?: string;
    paymentMethod?: PaymentMethod;
    reference?: string;
    observation?: string;
  }) => void;
  isLoading?: boolean;
}

export function EditDepositDialog({ open, onClose, deposit, onConfirm, isLoading }: EditDepositDialogProps) {
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState('');
  const [motif, setMotif] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = React.useState('');
  const [observation, setObservation] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setAmount(deposit.amount);
      setDate(deposit.date.slice(0, 10));
      setMotif(deposit.motif ?? '');
      setPaymentMethod(deposit.paymentMethod);
      setReference(deposit.reference ?? '');
      setObservation(deposit.observation ?? '');
    }
  }, [open, deposit]);

  const handleConfirm = () => {
    onConfirm({
      amount: Number(amount),
      date,
      motif: motif || undefined,
      paymentMethod,
      reference: reference || undefined,
      observation: observation || undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Modifier ce depot"
      description="Toute modification par le superadministrateur est tracee dans le journal d'audit et notifiee au client."
    >
      <div className="space-y-4">
        <FormField label="Montant" htmlFor="edit-dep-amount" required>
          <Input id="edit-dep-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Date" htmlFor="edit-dep-date">
            <Input id="edit-dep-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Mode de versement" htmlFor="edit-dep-method">
            <Select id="edit-dep-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              {Object.entries(paymentMethodLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label="Motif" htmlFor="edit-dep-motif">
          <Input id="edit-dep-motif" value={motif} onChange={(e) => setMotif(e.target.value)} />
        </FormField>
        <FormField label="Reference" htmlFor="edit-dep-reference">
          <Input id="edit-dep-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </FormField>
        <FormField label="Observation" htmlFor="edit-dep-observation">
          <Textarea id="edit-dep-observation" rows={3} value={observation} onChange={(e) => setObservation(e.target.value)} />
        </FormField>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleConfirm} loading={isLoading}>
          Enregistrer les modifications
        </Button>
      </div>
    </Dialog>
  );
}