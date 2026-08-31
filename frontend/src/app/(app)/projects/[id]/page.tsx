// frontend/src/app/(app)/projects/[id]/page.tsx - v1.4
// Carte "Budget" rendue cliquable pour isClient et isSuperadmin (les seuls
// roles pour qui cette carte s'affiche - deja exclue pour isSupervisor),
// ouvre EditBudgetDialog. Reste du fichier (graphique, transactions
// recentes, cartes Verse/Depense/Solde) inchange.

'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, ReceiptText, Wallet, ArrowDownToLine, ArrowUpFromLine, PiggyBank, ArrowDownRight, ArrowUpRight, Pencil } from 'lucide-react';
import { useProjectFinancialSummary, useUpdateProjectBudget } from '@/hooks/use-projects';
import { useDeposits } from '@/hooks/use-deposits';
import { useExpenses } from '@/hooks/use-expenses';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { EditBudgetDialog } from '@/components/projects/edit-budget-dialog';
import { formatDate, formatMoney, depositStatusMeta, expenseStatusMeta } from '@/lib/format';

const BAR_COLORS: Record<string, string> = {
  Budget: '#1e3a5f',
  Versé: '#4a7c59',
  Dépensé: '#b5533c',
  Solde: '#c9a24a',
};

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const { isClient, isSupervisor, isSuperadmin } = useAuth();
  const { data: summary, isLoading, isError } = useProjectFinancialSummary(params.id);
  const { data: recentDeposits } = useDeposits(params.id, { limit: 5 });
  const { data: recentExpenses } = useExpenses(params.id, { limit: 5 });
  const [editingBudget, setEditingBudget] = React.useState(false);
  const updateBudgetMutation = useUpdateProjectBudget(params.id);

  if (isLoading) return <PageSpinner />;
  if (isError || !summary) return <ErrorState message="Impossible de charger le resumé financier." />;

  const balance = parseFloat(summary.balance);
  const usedPct = Math.max(0, Number(summary.budgetUsedPercent) || 0);
  const usedPctClamped = Math.min(100, usedPct);
  const balanceTone = balance < 0 ? 'clay' : usedPct > 90 ? 'safety' : 'moss';
  const canEditBudget = isClient || isSuperadmin;

  const chartData = [
    { label: 'Budget', value: parseFloat(summary.budget) },
    { label: 'Versé', value: parseFloat(summary.totalDeposited) },
    { label: 'Dépensé', value: parseFloat(summary.totalSpent) },
    { label: 'Solde', value: balance },
  ];

  const transactions = [
    ...(recentDeposits?.items ?? []).map((d) => ({ type: 'Dépôt' as const, date: d.date, amount: parseFloat(d.amount), status: d.status, id: d.id })),
    ...(recentExpenses?.items ?? []).map((e) => ({ type: 'Dépense' as const, date: e.date, amount: -parseFloat(e.total), status: e.status, id: e.id, label: e.label })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  const cardCount = isSupervisor ? 3 : 4;

  return (
    <div className="space-y-6">
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${cardCount === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
        {!isSupervisor && (
          <Card
            className={`min-w-0 ${canEditBudget ? 'cursor-pointer transition-shadow hover:shadow-md' : ''}`}
            onClick={canEditBudget ? () => setEditingBudget(true) : undefined}
          >
            <CardContent className="min-w-0 space-y-1.5 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-1.5 text-ink-500">
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 shrink-0" />
                  <p className="truncate text-[10px] uppercase tracking-wide sm:text-xs">Budget</p>
                </div>
                {canEditBudget && <Pencil className="h-3 w-3 shrink-0 text-ink-300" />}
              </div>
              <p className="truncate font-ledger text-sm font-semibold text-ink-900 sm:text-base">{formatMoney(summary.budget, summary.currency)}</p>
            </CardContent>
          </Card>
        )}

        <Card className="min-w-0">
          <CardContent className="min-w-0 space-y-1.5 p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-moss-600">
              <ArrowDownToLine className="h-3.5 w-3.5 shrink-0" />
              <p className="truncate text-[10px] uppercase tracking-wide sm:text-xs">Total versé</p>
            </div>
            <p className="truncate font-ledger text-sm font-semibold text-ink-900 sm:text-base">{formatMoney(summary.totalDeposited, summary.currency)}</p>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="min-w-0 space-y-1.5 p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-safety-500">
              <ArrowUpFromLine className="h-3.5 w-3.5 shrink-0" />
              <p className="truncate text-[10px] uppercase tracking-wide sm:text-xs">Total dépensé</p>
            </div>
            <p className="truncate font-ledger text-sm font-semibold text-ink-900 sm:text-base">{formatMoney(summary.totalSpent, summary.currency)}</p>
            <div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-concrete-light">
                <div
                  className={`h-full rounded-full ${usedPct > 90 ? 'bg-clay' : usedPct > 70 ? 'bg-safety-400' : 'bg-moss'}`}
                  style={{ width: `${usedPctClamped}%` }}
                />
              </div>
              <p className="mt-1 truncate text-[10px] text-ink-400 sm:text-xs">{usedPct}% du budget</p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="min-w-0 space-y-1.5 p-3 sm:p-4">
            <div
              className={`flex items-center gap-1.5 ${
                balanceTone === 'clay' ? 'text-clay-600' : balanceTone === 'safety' ? 'text-safety-500' : 'text-moss-600'
              }`}
            >
              <PiggyBank className="h-3.5 w-3.5 shrink-0" />
              <p className="truncate text-[10px] uppercase tracking-wide sm:text-xs">Solde disponible</p>
            </div>
            <p className={`truncate font-ledger text-sm font-semibold sm:text-base ${balance < 0 ? 'text-clay-600' : 'text-ink-900'}`}>
              {formatMoney(summary.balance, summary.currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      {(Number(summary.pendingDepositsCount) > 0 || Number(summary.pendingExpensesCount) > 0) && (
        <div className="flex flex-wrap gap-3 rounded-card border border-safety-200 bg-safety-50 px-4 py-3 text-sm text-safety-500">
          {summary.pendingDepositsCount > 0 && (
            <span>
              {summary.pendingDepositsCount} dépôt(s) en attente ({formatMoney(summary.pendingDepositsAmount, summary.currency)})
            </span>
          )}
          {summary.pendingExpensesCount > 0 && (
            <span>
              {summary.pendingExpensesCount} dépense(s) en attente de confirmation ({formatMoney(summary.pendingExpensesAmount, summary.currency)})
            </span>
          )}
        </div>
      )}

      {(isClient || isSupervisor) && (
        <div className="flex gap-2">
          {isClient && (
            <Link href={`/projects/${params.id}/deposits/new`}>
              <Button size="sm" className="bg-[#C9A24A] text-[#1B1400] hover:bg-[#D8B563]">
                <Plus className="h-4 w-4" /> Nouveau dépôt
              </Button>
            </Link>
          )}
          {isSupervisor && (
            <Link href={`/projects/${params.id}/expenses/new`}>
              <Button size="sm" className="bg-[#C9A24A] text-[#1B1400] hover:bg-[#D8B563]">
                <ReceiptText className="h-4 w-4" /> Nouvelle dépense
              </Button>
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Vue financière</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d9d3c4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#5d7398' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#5d7398' }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
                <Tooltip formatter={(value: number) => formatMoney(value, summary.currency)} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#d9d3c4' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.label} fill={BAR_COLORS[entry.label] ?? '#1e3a5f'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transactions récentes</CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto p-0">
            {transactions.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-400">Aucune transaction pour le moment.</p>
            ) : (
              <ul className="divide-y divide-concrete">
                {transactions.map((t) => (
                  <li key={`${t.type}-${t.id}`} className="flex items-center gap-3 px-5 py-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        t.type === 'Depot' ? 'bg-moss-50 text-moss-600' : 'bg-concrete-light text-ink-500'
                      }`}
                    >
                      {t.type === 'Depot' ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-800">{t.type === 'Depot' ? 'Depot de fonds' : t.label}</p>
                      <p className="text-xs text-ink-400">{formatDate(t.date)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`font-ledger text-sm font-semibold ${t.amount >= 0 ? 'text-moss-600' : 'text-ink-800'}`}>
                        {t.amount >= 0 ? '+' : ''}
                        {formatMoney(t.amount, summary.currency)}
                      </p>
                      <StatusBadge
                        label={(t.type === 'Depot' ? depositStatusMeta : expenseStatusMeta)[t.status as keyof typeof depositStatusMeta].label}
                        tone={(t.type === 'Depot' ? depositStatusMeta : expenseStatusMeta)[t.status as keyof typeof depositStatusMeta].tone}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {canEditBudget && (
        <EditBudgetDialog
          open={editingBudget}
          onClose={() => setEditingBudget(false)}
          currentBudget={summary.budget}
          currency={summary.currency}
          onConfirm={(newBudget) => updateBudgetMutation.mutate(newBudget, { onSuccess: () => setEditingBudget(false) })}
          isLoading={updateBudgetMutation.isPending}
        />
      )}
    </div>
  );
}