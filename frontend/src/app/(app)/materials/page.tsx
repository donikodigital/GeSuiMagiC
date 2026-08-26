// ============================================================================
// app/(app)/materials/page.tsx - v2.0
// Refonte visuelle complete des 3 panneaux, aucun changement de
// logique/mutations (memes appels catalogService, memes hooks use-catalog).
//
// - CategoriesPanel / MaterialsPanel : <table> (source du scroll
//   horizontal - colonne "actions" poussee hors ecran sur la capture)
//   remplacee par une liste de cartes cliquables-au-toggle, meme langage
//   que ClientCard/SupervisorCard (icone ronde, StatusBadge, bouton
//   d'action colore selon l'etat).
// - Formulaires d'ajout : passes du flex-wrap (qui ecrasait les champs sur
//   mobile) a la grille verticale/horizontale deja utilisee dans
//   settings.tsx ("Ajouter un reglage"), avec bloc pointille pour bien
//   distinguer "creer" de "consulter".
// - UnitsPanel : grille de puces conservee (deja adaptee mobile) mais
//   restylee avec icone Ruler et couleurs de statut coherentes avec le
//   reste (moss actif / ink desactive) au lieu de gris plat.
// - Onglets : ajout d'icones (Tag / Package / Ruler) pour un reperage plus
//   rapide, structure inchangee.
// ============================================================================

'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, CheckCircle2, Package, Plus, Ruler, Tag } from 'lucide-react';
import { catalogService } from '@/services/catalog.service';
import { useCategories, useMaterials, useUnits } from '@/hooks/use-catalog';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api-client';
import { RequireRole } from '@/components/shared/require-role';

type Tab = 'categories' | 'materials' | 'units';

const TAB_ICON: Record<Tab, React.ComponentType<{ className?: string }>> = {
  categories: Tag,
  materials: Package,
  units: Ruler,
};

function MaterialsPageContent() {
  const [tab, setTab] = React.useState<Tab>('categories');

  return (
    <div>
      <PageHeader title="Catalogue" description="Categories, materiaux et unites disponibles pour l'enregistrement des depenses." />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-concrete">
        {(['categories', 'materials', 'units'] as Tab[]).map((t) => {
          const Icon = TAB_ICON[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium',
                tab === t ? 'border-blueprint-600 text-blueprint-700' : 'border-transparent text-ink-500 hover:text-ink-800',
              )}
            >
              <Icon className="h-4 w-4" />
              {{ categories: 'Categories', materials: 'Materiaux', units: 'Unites' }[t]}
            </button>
          );
        })}
      </div>

      {tab === 'categories' && <CategoriesPanel />}
      {tab === 'materials' && <MaterialsPanel />}
      {tab === 'units' && <UnitsPanel />}
    </div>
  );
}

function ToggleButton({ active, onClick, loading }: { active: boolean; onClick: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={active ? 'Desactiver' : 'Reactiver'}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
        active ? 'text-clay-500 hover:bg-clay-50' : 'text-moss-600 hover:bg-moss-50',
      )}
    >
      {active ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
    </button>
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
      <div className="rounded-card border border-dashed border-concrete-dark bg-paper/60 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-500">Nouvelle categorie</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Nom</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Menuiserie aluminium" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Groupe (affichage)</label>
            <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Ex: Finitions" />
          </div>
          <Button className="w-full sm:w-auto" disabled={!name} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>
      </div>

      {!isLoading &&
        (categories && categories.length > 0 ? (
          <div className="space-y-2.5">
            {categories.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-center gap-3 p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
                    <Tag className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-900">{c.name}</p>
                    <p className="truncate text-xs text-ink-400">{c.group || 'Sans groupe'}</p>
                  </div>
                  <StatusBadge label={c.isActive ? 'Actif' : 'Desactive'} tone={c.isActive ? 'moss' : 'ink'} className="shrink-0" />
                  <ToggleButton active={c.isActive} loading={toggleMutation.isPending} onClick={() => toggleMutation.mutate({ id: c.id, active: c.isActive })} />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="Aucune categorie" description="Ajoutez votre premiere categorie ci-dessus." />
        ))}
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
      <div className="rounded-card border border-dashed border-concrete-dark bg-paper/60 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-500">Nouveau materiau</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Nom</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Carrelage 60x60" />
          </div>
          <div>
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
          <div>
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
          <Button className="w-full lg:w-auto" disabled={!name || !newCategoryId} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>
      </div>

      <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full sm:w-64">
        <option value="">Toutes les categories</option>
        {categories?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      {!isLoading &&
        (filtered && filtered.length > 0 ? (
          <div className="space-y-2.5">
            {filtered.map((m) => (
              <Card key={m.id}>
                <CardContent className="flex items-center gap-3 p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
                    <Package className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-900">{m.name}</p>
                    <p className="truncate text-xs text-ink-400">
                      {m.category?.name || 'Sans categorie'}
                      {m.defaultUnit?.name ? ` · ${m.defaultUnit.name}` : ''}
                    </p>
                  </div>
                  <StatusBadge label={m.isActive ? 'Actif' : 'Desactive'} tone={m.isActive ? 'moss' : 'ink'} className="shrink-0" />
                  <ToggleButton active={m.isActive} loading={toggleMutation.isPending} onClick={() => toggleMutation.mutate({ id: m.id, active: m.isActive })} />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="Aucun materiau" description="Ajoutez votre premier materiau ci-dessus." />
        ))}
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
      <div className="rounded-card border border-dashed border-concrete-dark bg-paper/60 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-500">Nouvelle unite</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Nom</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Metre lineaire" />
          </div>
          <div className="w-full sm:w-32">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Symbole</label>
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="m" />
          </div>
          <Button className="w-full sm:w-auto" disabled={!name} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>
      </div>

      {!isLoading &&
        (units && units.length > 0 ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {units.map((u) => (
              <button
                key={u.id}
                onClick={() => toggleMutation.mutate({ id: u.id, active: u.isActive })}
                className={cn(
                  'flex items-center gap-3 rounded-card border p-3.5 text-left transition-colors',
                  u.isActive ? 'border-concrete bg-white hover:border-blueprint-200' : 'border-concrete-light bg-concrete-light/60',
                )}
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', u.isActive ? 'bg-blueprint-50 text-blueprint-600' : 'bg-concrete-light text-ink-400')}>
                  <Ruler className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate font-medium', u.isActive ? 'text-ink-900' : 'text-ink-400')}>{u.name}</p>
                  {u.symbol && <p className="truncate text-xs text-ink-400">{u.symbol}</p>}
                </div>
                <StatusBadge label={u.isActive ? 'Actif' : 'Desactive'} tone={u.isActive ? 'moss' : 'ink'} className="shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="Aucune unite" description="Ajoutez votre premiere unite ci-dessus." />
        ))}
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