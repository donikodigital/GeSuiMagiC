//frontend/src/app/(app)/projects/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, ReceiptText } from 'lucide-react';
import { useProjectFinancialSummary } from '@/hooks/use-projects';
import { useDeposits } from '@/hooks/use-deposits';
import { useExpenses } from '@/hooks/use-expenses';
import { useAuth } from '@/hooks/use-auth';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { formatDate, formatMoney, depositStatusMeta, expenseStatusMeta } from '@/lib/format';

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const { isClient, isSupervisor } = useAuth();
  const { data: summary, isLoading, isError } = useProjectFinancialSummary(params.id);
  const { data: recentDeposits } = useDeposits(params.id, { limit: 5 });
  const { data: recentExpenses } = useExpenses(params.id, { limit: 5 });

  if (isLoading) return <PageSpinner />;
  if (isError || !summary) return <ErrorState message="Impossible de charger le resume financier." />;

  const chartData = [
    { label: 'Budget', value: parseFloat(summary.budget) },
    { label: 'Verse', value: parseFloat(summary.totalDeposited) },
    { label: 'Depense', value: parseFloat(summary.totalSpent) },
    { label: 'Solde', value: parseFloat(summary.balance) },
  ];

  const transactions = [
    ...(recentDeposits?.items ?? []).map((d) => ({ type: 'Depot' as const, date: d.date, amount: parseFloat(d.amount), status: d.status, id: d.id })),
    ...(recentExpenses?.items ?? []).map((e) => ({ type: 'Depense' as const, date: e.date, amount: -parseFloat(e.total), status: e.status, id: e.id, label: e.label })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Budget" value={formatMoney(summary.budget, summary.currency)} />
        <StatCard label="Total verse" value={formatMoney(summary.totalDeposited, summary.currency)} />
        <StatCard label="Total depense" value={formatMoney(summary.totalSpent, summary.currency)} hint={`${summary.budgetUsedPercent}% du budget`} />
        <StatCard
          label="Solde disponible"
          value={formatMoney(summary.balance, summary.currency)}
          tone={parseFloat(summary.balance) < 0 ? 'clay' : summary.budgetUsedPercent > 90 ? 'safety' : 'moss'}
        />
      </div>

      {(Number(summary.pendingDepositsCount) > 0 || Number(summary.pendingExpensesCount) > 0) && (
        <div className="flex flex-wrap gap-3 rounded-card border border-safety-200 bg-safety-50 px-4 py-3 text-sm text-safety-500">
          {summary.pendingDepositsCount > 0 && (
            <span>
              {summary.pendingDepositsCount} depot(s) en attente ({formatMoney(summary.pendingDepositsAmount, summary.currency)})
            </span>
          )}
          {summary.pendingExpensesCount > 0 && (
            <span>
              {summary.pendingExpensesCount} depense(s) en attente de confirmation ({formatMoney(summary.pendingExpensesAmount, summary.currency)})
            </span>
          )}
        </div>
      )}

      {(isClient || isSupervisor) && (
        <div className="flex gap-2">
          {isClient && (
            <Link href={`/projects/${params.id}/deposits/new`}>
              <Button size="sm">
                <Plus className="h-4 w-4" /> Nouveau depot
              </Button>
            </Link>
          )}
          {isSupervisor && (
            <Link href={`/projects/${params.id}/expenses/new`}>
              <Button size="sm">
                <ReceiptText className="h-4 w-4" /> Nouvelle depense
              </Button>
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Vue financiere</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d9d3c4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#5d7398' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#5d7398' }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
                <Tooltip formatter={(value: number) => formatMoney(value, summary.currency)} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#d9d3c4' }} />
                <Bar dataKey="value" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transactions recentes</CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto p-0">
            {transactions.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-400">Aucune transaction pour le moment.</p>
            ) : (
              <ul className="divide-y divide-concrete">
                {transactions.map((t) => (
                  <li key={`${t.type}-${t.id}`} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink-800">{t.type === 'Depot' ? 'Depot de fonds' : t.label}</p>
                      <p className="text-xs text-ink-400">{formatDate(t.date)}</p>
                    </div>
                    <div className="text-right">
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
    </div>
  );
}
