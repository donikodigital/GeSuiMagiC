'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Power } from 'lucide-react';
import { catalogService } from '@/services/catalog.service';
import { useCategories, useMaterials, useUnits } from '@/hooks/use-catalog';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api-client';
import { RequireRole } from '@/components/shared/require-role';

type Tab = 'categories' | 'materials' | 'units';

function MaterialsPageContent() {
  const [tab, setTab] = React.useState<Tab>('categories');

  return (
    <div>
      <PageHeader title="Catalogue" description="Categories, materiaux et unites disponibles pour l'enregistrement des depenses." />

      <div className="mb-6 flex gap-1 border-b border-concrete">
        {(['categories', 'materials', 'units'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'border-b-2 px-3 py-2.5 text-sm font-medium',
              tab === t ? 'border-blueprint-600 text-blueprint-700' : 'border-transparent text-ink-500 hover:text-ink-800',
            )}
          >
            {{ categories: 'Categories', materials: 'Materiaux', units: 'Unites' }[t]}
          </button>
        ))}
      </div>

      {tab === 'categories' && <CategoriesPanel />}
      {tab === 'materials' && <MaterialsPanel />}
      {tab === 'units' && <UnitsPanel />}
    </div>
  );
}

function CategoriesPanel() {
  const queryClient = useQueryClient();
  const { data: categories, isLoading } = useCategories(true);
  const [name, setName] = React.useState('');
  const [group, setGroup] = React.useState('');

  const createMutation = useMutation({
    mutationFn: () => catalogService.categories.create({ name, group: group || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setName('');
      setGroup('');
      toast.success('Categorie ajoutee.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de creer cette categorie.'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? catalogService.categories.deactivate(id) : catalogService.categories.reactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Nom</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Menuiserie aluminium" />
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Groupe (affichage)</label>
            <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Ex: Finitions" />
          </div>
          <Button disabled={!name} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </CardContent>
      </Card>

      {!isLoading && (
        <div className="overflow-hidden rounded-card border border-concrete bg-white">
          <table className="w-full text-sm">
            <thead className="bg-concrete-light/60 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Groupe</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-concrete">
              {categories?.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5 font-medium text-ink-900">{c.name}</td>
                  <td className="px-4 py-2.5 text-ink-500">{c.group || '-'}</td>
                  <td className="px-4 py-2.5">{c.isActive ? 'Actif' : 'Desactive'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => toggleMutation.mutate({ id: c.id, active: c.isActive })}
                      className="rounded-md p-1.5 text-ink-300 hover:bg-concrete-light hover:text-ink-700"
                    >
                      <Power className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MaterialsPanel() {
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const { data: units } = useUnits();
  const [categoryId, setCategoryId] = React.useState('');
  const { data: materials, isLoading } = useMaterials(undefined, true);
  const [name, setName] = React.useState('');
  const [newCategoryId, setNewCategoryId] = React.useState('');
  const [defaultUnitId, setDefaultUnitId] = React.useState('');

  const createMutation = useMutation({
    mutationFn: () => catalogService.materials.create({ name, categoryId: newCategoryId, defaultUnitId: defaultUnitId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setName('');
      toast.success('Materiau ajoute.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de creer ce materiau.'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? catalogService.materials.deactivate(id) : catalogService.materials.reactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['materials'] }),
  });

  const filtered = categoryId ? materials?.filter((m) => m.categoryId === categoryId) : materials;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Nom</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Carrelage 60x60" />
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Categorie</label>
            <Select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)}>
              <option value="">Selectionner</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Unite par defaut</label>
            <Select value={defaultUnitId} onChange={(e) => setDefaultUnitId(e.target.value)}>
              <option value="">-</option>
              {units?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <Button disabled={!name || !newCategoryId} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </CardContent>
      </Card>

      <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-64">
        <option value="">Toutes les categories</option>
        {categories?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      {!isLoading && (
        <div className="overflow-hidden rounded-card border border-concrete bg-white">
          <table className="w-full text-sm">
            <thead className="bg-concrete-light/60 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Categorie</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-concrete">
              {filtered?.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2.5 font-medium text-ink-900">{m.name}</td>
                  <td className="px-4 py-2.5 text-ink-500">{m.category?.name}</td>
                  <td className="px-4 py-2.5">{m.isActive ? 'Actif' : 'Desactive'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => toggleMutation.mutate({ id: m.id, active: m.isActive })} className="rounded-md p-1.5 text-ink-300 hover:bg-concrete-light hover:text-ink-700">
                      <Power className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UnitsPanel() {
  const queryClient = useQueryClient();
  const { data: units, isLoading } = useUnits(true);
  const [name, setName] = React.useState('');
  const [symbol, setSymbol] = React.useState('');

  const createMutation = useMutation({
    mutationFn: () => catalogService.units.create({ name, symbol: symbol || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      setName('');
      setSymbol('');
      toast.success('Unite ajoutee.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de creer cette unite.'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => (active ? catalogService.units.deactivate(id) : catalogService.units.reactivate(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['units'] }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Nom</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Metre lineaire" />
          </div>
          <div className="w-32">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Symbole</label>
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="m" />
          </div>
          <Button disabled={!name} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </CardContent>
      </Card>

      {!isLoading && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {units?.map((u) => (
            <button
              key={u.id}
              onClick={() => toggleMutation.mutate({ id: u.id, active: u.isActive })}
              className={cn(
                'flex items-center justify-between rounded-card border px-3 py-2 text-sm',
                u.isActive ? 'border-concrete bg-white text-ink-800' : 'border-concrete-light bg-concrete-light text-ink-400',
              )}
            >
              {u.name} {u.symbol && <span className="text-ink-400">({u.symbol})</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MaterialsPage() {
  return (
    <RequireRole roles={['SUPERADMIN']}>
      <MaterialsPageContent />
    </RequireRole>
  );
}
