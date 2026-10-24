//frontend/src/app/(app)/projects/[id]/deposits/new/page.tsx
// Nouveau depot, y compris un envoi de l'etranger : montant envoye, devise, taux et frais de transfert (taux reel calcule).

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Globe2, HandCoins } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { useCreateDeposit } from '@/hooks/use-deposits';
import { projectsService } from '@/services/projects.service';
import { useProject } from '@/hooks/use-projects';
import { formatMoney, paymentMethodLabels } from '@/lib/format';
import { RequireRole } from '@/components/shared/require-role';

const schema = z.object({
  supervisorId: z.string().min(1, 'Selectionnez un superviseur bénéficiaire'),
  amount: z.coerce.number().positive('Le montant doit être superieur à 0'),
  date: z.string().optional(),
  motif: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHECK', 'OTHER']),
  reference: z.string().optional(),
  observation: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface ProjectSupervisorRow {
  supervisor: { id: string; firstName: string; lastName: string };
}

function SectionIcon({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function NewDepositPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const createDeposit = useCreateDeposit(params.id);
  const { data: project } = useProject(params.id);
  const projectCurrency = project?.currency ?? 'GNF';

  // Envoi de l'etranger : champs hors du schema principal, valides ici.
  const [foreign, setForeign] = React.useState(false);
  const [originalAmount, setOriginalAmount] = React.useState('');
  const [originalCurrency, setOriginalCurrency] = React.useState('EUR');
  const [exchangeRate, setExchangeRate] = React.useState('');
  const [transferFees, setTransferFees] = React.useState('');

  const supervisorsQuery = useQuery({
    queryKey: ['projects', params.id, 'supervisors'],
    queryFn: () => projectsService.listSupervisors(params.id) as unknown as Promise<ProjectSupervisorRow[]>,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { paymentMethod: 'BANK_TRANSFER' } });
  const amount = Number(useWatch({ control, name: 'amount' })) || 0;

  const original = Number(originalAmount) || 0;
  const rate = Number(exchangeRate) || 0;
  const fees = Number(transferFees) || 0;
  const expected = original * rate;
  const gapPercent = expected > 0 ? ((amount - expected) / expected) * 100 : 0;
  const effectiveRate = original + fees > 0 ? amount / (original + fees) : 0;
  const currencyCode = originalCurrency.trim().toUpperCase();
  const foreignValid = !foreign || (original > 0 && rate > 0 && /^[A-Z]{3}$/.test(currencyCode) && currencyCode !== projectCurrency);

  const onSubmit = async (values: FormValues) => {
    await createDeposit.mutateAsync({
      ...values,
      amount: Number(values.amount),
      ...(foreign ? { originalAmount: original, originalCurrency: currencyCode, exchangeRate: rate, transferFees: transferFees ? fees : undefined } : {}),
    });
    router.push(`/projects/${params.id}/deposits`);
  };

  return (
    <div className="mx-auto max-w-lg pb-4">
      <PageHeader title="Nouveau dépôt" description="Le superviseur bénéficiaire devra valider ce dépôt avant qu'il n'alimente le solde." />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Card className="border-blueprint-200 bg-blueprint-50/40">
          <CardHeader className="items-start gap-3 border-blueprint-200">
            <SectionIcon icon={HandCoins} />
            <div>
              <CardTitle>Bénéficiaire et montant</CardTitle>
              <CardDescription>Le dépôt alimentera le solde une fois validé par le superviseur.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Superviseur bénéficiaire" htmlFor="supervisorId" required error={errors.supervisorId?.message}>
              <Select id="supervisorId" {...register('supervisorId')} defaultValue="">
                <option value="" disabled>
                  Selectionner un superviseur
                </option>
                {supervisorsQuery.data?.map((ps) => (
                  <option key={ps.supervisor.id} value={ps.supervisor.id}>
                    {ps.supervisor.firstName} {ps.supervisor.lastName}
                  </option>
                ))}
              </Select>
              {supervisorsQuery.data?.length === 0 && (
                <p className="mt-1 text-xs text-safety-500">Aucun superviseur n&apos;est encore affecté à ce projet.</p>
              )}
            </FormField>

            <FormField label="Montant" htmlFor="amount" required error={errors.amount?.message}>
              <Input
                id="amount"
                type="number"
                placeholder="50000000"
                className="font-ledger text-base font-semibold"
                {...register('amount')}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="items-start gap-3">
            <SectionIcon icon={Globe2} />
            <div>
              <CardTitle>Envoi de l&apos;étranger</CardTitle>
              <CardDescription>Si l&apos;argent a été envoyé dans une autre devise, gardez la trace du taux et des frais.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2.5 text-sm text-ink-700">
              <input type="checkbox" checked={foreign} onChange={(e) => setForeign(e.target.checked)} className="h-4 w-4 rounded border-concrete text-blueprint-600" />
              Ce dépôt a été envoyé dans une autre devise que {projectCurrency}
            </label>
            {foreign && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Montant envoyé" htmlFor="originalAmount" required>
                    <Input id="originalAmount" type="number" inputMode="decimal" min={0} step="0.01" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} />
                  </FormField>
                  <FormField label="Devise d'origine" htmlFor="originalCurrency" required hint="Code à 3 lettres (EUR, USD…)">
                    <Input id="originalCurrency" value={originalCurrency} maxLength={3} className="uppercase" onChange={(e) => setOriginalCurrency(e.target.value.toUpperCase())} />
                  </FormField>
                  <FormField label={`Taux (1 ${currencyCode || '…'} = … ${projectCurrency})`} htmlFor="exchangeRate" required>
                    <Input id="exchangeRate" type="number" inputMode="decimal" min={0} step="any" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
                  </FormField>
                  <FormField label={`Frais de transfert (${currencyCode || '…'})`} htmlFor="transferFees">
                    <Input id="transferFees" type="number" inputMode="decimal" min={0} step="0.01" value={transferFees} onChange={(e) => setTransferFees(e.target.value)} />
                  </FormField>
                </div>
                {currencyCode === projectCurrency && <p className="text-xs text-clay-600">La devise d&apos;origine est déjà celle du projet.</p>}
                {original > 0 && rate > 0 && amount > 0 && (
                  <div className="space-y-1.5 rounded-xl bg-blueprint-50/60 px-4 py-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-500">Montant attendu</span>
                      <span className="font-ledger font-semibold text-ink-900">{formatMoney(expected, projectCurrency)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-500">Taux réel (frais compris)</span>
                      <span className="font-ledger font-semibold text-ink-900">{effectiveRate.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-500">Écart avec le montant crédité</span>
                      <span className={`font-ledger font-semibold ${Math.abs(gapPercent) > 5 ? 'text-clay-600' : 'text-moss-600'}`}>
                        {gapPercent > 0 ? '+' : ''}
                        {gapPercent.toFixed(1)} %
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="items-start gap-3">
            <SectionIcon icon={CalendarRange} />
            <div>
              <CardTitle>Détails du versement</CardTitle>
              <CardDescription>Date, mode et références utiles au suivi.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Date" htmlFor="date">
                <Input id="date" type="date" {...register('date')} />
              </FormField>
              <FormField label="Mode de versement" htmlFor="paymentMethod">
                <Select id="paymentMethod" {...register('paymentMethod')}>
                  {Object.entries(paymentMethodLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <FormField label="Motif" htmlFor="motif">
              <Input id="motif" placeholder="Versement pour fondations" {...register('motif')} />
            </FormField>

            <FormField label="Reference" htmlFor="reference" hint="Numero de transaction, reference bancaire...">
              <Input id="reference" {...register('reference')} />
            </FormField>

            <FormField label="Observation" htmlFor="observation">
              <Textarea id="observation" rows={3} {...register('observation')} />
            </FormField>
          </CardContent>
        </Card>

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-concrete bg-paper/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Annuler
            </Button>
            <Button type="submit" loading={createDeposit.isPending} disabled={!foreignValid}>
              Enregistrer le dépôt
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function NewDepositPage() {
  return (
    <RequireRole roles={['CLIENT']}>
      <NewDepositPageContent />
    </RequireRole>
  );
}