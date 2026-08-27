// frontend/src/components/expenses/edit-expense-dialog.tsx
'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { useCategories, useMaterials, useUnits } from '@/hooks/use-catalog';
import type { Expense } from '@/types/models';

interface EditExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  expense: Expense;
  onConfirm: (payload: {
    date?: string;
    categoryId?: string;
    materialId?: string;
    label?: string;
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    observation?: string;
    supplier?: string;
    invoiceReference?: string;
  }) => void;
  isLoading?: boolean;
}

export function EditExpenseDialog({ open, onClose, expense, onConfirm, isLoading }: EditExpenseDialogProps) {
  const { data: categories } = useCategories(true);
  const { data: units } = useUnits(true);
  const [categoryId, setCategoryId] = React.useState('');
  const { data: materials } = useMaterials(categoryId || undefined, true);

  const [date, setDate] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [materialId, setMaterialId] = React.useState('');
  const [quantity, setQuantity] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [unitPrice, setUnitPrice] = React.useState('');
  const [supplier, setSupplier] = React.useState('');
  const [invoiceReference, setInvoiceReference] = React.useState('');
  const [observation, setObservation] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setDate(expense.date.slice(0, 10));
      setCategoryId(expense.categoryId);
      setMaterialId(expense.materialId ?? '');
      setLabel(expense.label);
      setQuantity(expense.quantity);
      setUnit(expense.unit);
      setUnitPrice(expense.unitPrice);
      setSupplier(expense.supplier ?? '');
      setInvoiceReference(expense.invoiceReference ?? '');
      setObservation(expense.observation ?? '');
    }
  }, [open, expense]);

  const handleConfirm = () => {
    onConfirm({
      date,
      categoryId,
      materialId: materialId || undefined,
      label,
      quantity: Number(quantity),
      unit,
      unitPrice: Number(unitPrice),
      supplier: supplier || undefined,
      invoiceReference: invoiceReference || undefined,
      observation: observation || undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Modifier cette depense"
      description="Toute modification par le superadministrateur est tracee dans le journal d'audit et notifiee au client. Si la quantite ou le prix unitaire change, le total est recalcule."
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Categorie" htmlFor="edit-exp-category">
            <Select
              id="edit-exp-category"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setMaterialId('');
              }}
            >
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Materiau / element" htmlFor="edit-exp-material">
            <Select id="edit-exp-material" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              <option value="">-</option>
              {materials?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <FormField label="Libelle" htmlFor="edit-exp-label" required>
          <Input id="edit-exp-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </FormField>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Quantite" htmlFor="edit-exp-quantity" required>
            <Input id="edit-exp-quantity" type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </FormField>
          <FormField label="Unite" htmlFor="edit-exp-unit" required>
            <Select id="edit-exp-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {units?.map((u) => (
                <option key={u.id} value={u.symbol || u.name}>
                  {u.symbol || u.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Prix unitaire" htmlFor="edit-exp-price" required>
            <Input id="edit-exp-price" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Date" htmlFor="edit-exp-date">
            <Input id="edit-exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Fournisseur" htmlFor="edit-exp-supplier">
            <Input id="edit-exp-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </FormField>
        </div>

        <FormField label="Reference facture" htmlFor="edit-exp-invoice">
          <Input id="edit-exp-invoice" value={invoiceReference} onChange={(e) => setInvoiceReference(e.target.value)} />
        </FormField>

        <FormField label="Observation" htmlFor="edit-exp-observation">
          <Textarea id="edit-exp-observation" rows={3} value={observation} onChange={(e) => setObservation(e.target.value)} />
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