//frontend/src/components/meals/meal-dialogs.tsx
'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { useCategories } from '@/hooks/use-catalog';
import { useMealActions } from '@/hooks/use-meals';
import { addMonths, monthLabel } from '@/lib/month';
import { formatMoney } from '@/lib/format';
import type { MealMonthReport, MealAccountRequest } from '@/types/models';

interface BaseProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

/** Montant saisi -> nombre >= 0 (virgule ou point, espaces ignores) ; NaN si invalide. */
function parseAmount(value: string): number {
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : NaN;
}

// --------------------------------------------------------------------------
// Enveloppe du mois
// --------------------------------------------------------------------------

export function EnvelopeDialog({ open, onClose, projectId, report }: BaseProps & { report: MealMonthReport }) {
  const { saveEnvelope } = useMealActions(projectId);
  const { data: categories } = useCategories();
  const [allocated, setAllocated] = React.useState('');
  const [unitCost, setUnitCost] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [note, setNote] = React.useState('');

  const foodCategories = React.useMemo(() => (categories ?? []).filter((c) => c.isActive), [categories]);

  React.useEffect(() => {
    if (!open) return;
    const { envelope } = report;
    setAllocated(envelope ? String(parseFloat(envelope.allocatedAmount)) : '');
    setUnitCost(envelope ? String(parseFloat(envelope.mealUnitCost)) : '');
    setNote(envelope?.note ?? '');
    // Sans categorie deja choisie, on propose celle qui ressemble a "Alimentation".
    setCategoryId(envelope?.categoryId ?? foodCategories.find((c) => /aliment|repas|nourrit/i.test(c.name))?.id ?? '');
  }, [open, report, foodCategories]);

  const allocatedNumber = parseAmount(allocated);
  const unitNumber = parseAmount(unitCost);
  const valid = !Number.isNaN(allocatedNumber) && !Number.isNaN(unitNumber) && allocated !== '' && unitCost !== '';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    await saveEnvelope.mutateAsync({
      month: report.month,
      payload: { allocatedAmount: allocatedNumber, mealUnitCost: unitNumber, categoryId: categoryId || undefined, note: note.trim() || undefined },
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Enveloppe de ${monthLabel(report.month)}`}
      description="Le montant envoyé pour nourrir les ouvriers ce mois-ci, et le coût d'un repas par ouvrier."
    >
      <form onSubmit={submit} className="space-y-4">
        <FormField label={`Montant envoyé pour le mois (${report.currency})`} htmlFor="env-amount" required>
          <Input id="env-amount" inputMode="decimal" value={allocated} onChange={(e) => setAllocated(e.target.value)} placeholder="Ex. 1000000" />
        </FormField>

        <FormField
          label={`Coût d'un repas par ouvrier et par jour (${report.currency})`}
          htmlFor="env-unit"
          required
          hint="Sert à calculer ce que les jours travaillés justifient : ouvriers × jours × coût du repas."
        >
          <Input id="env-unit" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Ex. 25000" />
        </FormField>

        <FormField
          label="Catégorie de dépenses « alimentation »"
          htmlFor="env-category"
          hint="Les dépenses enregistrées dans cette catégorie sont comptées comme repas payés par le superviseur."
        >
          <Select id="env-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Aucune (pas de comparaison avec les dépenses)</option>
            {foodCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Note (facultatif)" htmlFor="env-note">
          <Textarea id="env-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={saveEnvelope.isPending} disabled={!valid}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// Report du reliquat
// --------------------------------------------------------------------------

export function CarryOverDialog({ open, onClose, projectId, report }: BaseProps & { report: MealMonthReport }) {
  const { carryOver } = useMealActions(projectId);
  const carryable = parseFloat(report.amounts.carryableAmount);
  const targets = React.useMemo(() => Array.from({ length: 6 }, (_, i) => addMonths(report.month, i + 1)), [report.month]);

  const [toMonth, setToMonth] = React.useState(targets[0]);
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setToMonth(targets[0]);
    setAmount(String(carryable));
    setReason('');
  }, [open, targets, carryable]);

  const amountNumber = parseAmount(amount);
  const valid = !Number.isNaN(amountNumber) && amountNumber > 0 && amountNumber <= carryable;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    await carryOver.mutateAsync({ fromMonth: report.month, payload: { toMonth, amount: amountNumber, reason: reason.trim() || undefined } });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Réutiliser le reliquat"
      description={`Reportez ce qui n'a pas été dépensé en ${monthLabel(report.month)} sur un mois suivant.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl border border-moss-200 bg-moss-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-moss-600">Reportable</p>
          <p className="font-ledger text-xl font-bold text-moss-600">{formatMoney(carryable, report.currency)}</p>
          <p className="mt-0.5 text-xs text-moss-600/80">Reliquat moins les dépenses encore en attente de validation.</p>
        </div>

        <FormField label="Reporter sur" htmlFor="co-month" required>
          <Select id="co-month" value={toMonth} onChange={(e) => setToMonth(e.target.value)}>
            {targets.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label={`Montant à reporter (${report.currency})`}
          htmlFor="co-amount"
          required
          error={!Number.isNaN(amountNumber) && amountNumber > carryable ? 'Supérieur au montant reportable.' : undefined}
        >
          <div className="flex gap-2">
            <Input id="co-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button type="button" variant="outline" onClick={() => setAmount(String(carryable))}>
              Tout
            </Button>
          </div>
        </FormField>

        <FormField label="Motif (facultatif)" htmlFor="co-reason">
          <Textarea id="co-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. chantier arrêté pendant la saison des pluies" />
        </FormField>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={carryOver.isPending} disabled={!valid}>
            Reporter
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function CancelCarryOverDialog({
  open,
  onClose,
  projectId,
  carryOverId,
}: BaseProps & { carryOverId: string | null }) {
  const { cancelCarryOver } = useMealActions(projectId);
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!carryOverId || reason.trim().length < 3) return;
    await cancelCarryOver.mutateAsync({ carryOverId, reason: reason.trim() });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Annuler ce report ?" description="Le montant revient dans le reliquat du mois d'origine. Un motif est conservé dans le journal d'audit.">
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Motif de l'annulation" htmlFor="cc-reason" required>
          <Textarea id="cc-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Retour
          </Button>
          <Button type="submit" variant="danger" loading={cancelCarryOver.isPending} disabled={reason.trim().length < 3}>
            Annuler le report
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// Demandes de comptes
// --------------------------------------------------------------------------

export function RequestDialog({ open, onClose, projectId, month }: BaseProps & { month: string }) {
  const { createRequest } = useMealActions(projectId);
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    if (open) setMessage('');
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (message.trim().length < 5) return;
    await createRequest.mutateAsync({ month, message: message.trim() });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Demander des comptes"
      description={`Posez votre question au superviseur sur l'alimentation de ${monthLabel(month)}. Il sera prévenu par notification et par email.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Votre demande" htmlFor="rq-message" required>
          <Textarea
            id="rq-message"
            rows={4}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex. Les ouvriers n'ont travaillé que 5 jours : pouvez-vous détailler les repas payés ?"
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={createRequest.isPending} disabled={message.trim().length < 5}>
            Envoyer la demande
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AnswerDialog({ open, onClose, projectId, request }: BaseProps & { request: MealAccountRequest | null }) {
  const { answerRequest } = useMealActions(projectId);
  const [response, setResponse] = React.useState('');

  React.useEffect(() => {
    if (open) setResponse('');
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!request || response.trim().length < 2) return;
    await answerRequest.mutateAsync({ requestId: request.id, response: response.trim() });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Répondre au client" description="Expliquez l'utilisation de l'argent. Le client sera prévenu.">
      <form onSubmit={submit} className="space-y-4">
        {request && (
          <blockquote className="rounded-xl border border-concrete bg-paper px-4 py-3 text-sm text-ink-700">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">Question du client</p>
            <p className="whitespace-pre-wrap">{request.message}</p>
          </blockquote>
        )}
        <FormField label="Votre réponse" htmlFor="an-response" required>
          <Textarea id="an-response" rows={4} maxLength={2000} value={response} onChange={(e) => setResponse(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={answerRequest.isPending} disabled={response.trim().length < 2}>
            Envoyer la réponse
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
