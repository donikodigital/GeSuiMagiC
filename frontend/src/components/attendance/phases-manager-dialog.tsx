//frontend/src/components/attendance/phases-manager-dialog.tsx
'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Pencil, Plus, Trash2, Wallet, X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePhaseActions } from '@/hooks/use-attendance';
import { useSitePermissions } from '@/hooks/use-site';
import type { ProjectPhase } from '@/types/models';

interface PhasesManagerDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  phases: ProjectPhase[];
}

/** Ajout, renommage, ordre, desactivation et suppression des etapes du chantier. */
export function PhasesManagerDialog({ open, onClose, projectId, phases }: PhasesManagerDialogProps) {
  const { create, update, reorder, remove } = usePhaseActions(projectId);
  const permissions = useSitePermissions(projectId);
  const [planningId, setPlanningId] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');
  const [toDelete, setToDelete] = React.useState<ProjectPhase | null>(null);

  React.useEffect(() => {
    if (!open) {
      setNewName('');
      setEditingId(null);
      setPlanningId(null);
    }
  }, [open]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (name.length < 2) return;
    await create.mutateAsync(name);
    setNewName('');
  };

  const move = (index: number, direction: -1 | 1) => {
    const ids = phases.map((p) => p.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };

  const saveName = async (phase: ProjectPhase) => {
    const name = editingName.trim();
    if (name.length < 2 || name === phase.name) {
      setEditingId(null);
      return;
    }
    await update.mutateAsync({ phaseId: phase.id, payload: { name } });
    setEditingId(null);
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} title="Étapes du chantier" description="Fondation, murs, toiture... Adaptez la liste à votre projet." maxWidth="max-w-xl">
        <div className="space-y-2">
          {phases.length === 0 && <p className="rounded-card border border-dashed border-concrete-dark px-4 py-6 text-center text-sm text-ink-500">Aucune étape pour le moment.</p>}

          {phases.map((phase, index) => (
            <React.Fragment key={phase.id}>
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 shadow-card ${phase.isActive ? 'border-concrete bg-white' : 'border-concrete bg-concrete-light/60'}`}
            >
              <div className="flex shrink-0 flex-col">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0 || reorder.isPending} className="text-ink-300 hover:text-ink-700 disabled:opacity-30" aria-label="Monter">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === phases.length - 1 || reorder.isPending}
                  className="text-ink-300 hover:text-ink-700 disabled:opacity-30"
                  aria-label="Descendre"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                {editingId === phase.id ? (
                  <Input
                    autoFocus
                    value={editingName}
                    maxLength={80}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveName(phase);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="h-8"
                  />
                ) : (
                  <>
                    <p className={`truncate text-sm font-medium ${phase.isActive ? 'text-ink-900' : 'text-ink-400 line-through'}`}>{phase.name}</p>
                    <p className="text-xs text-ink-400">
                      {phase.workedDays} jour{phase.workedDays > 1 ? 's' : ''} travaillé{phase.workedDays > 1 ? 's' : ''}
                    </p>
                  </>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                {editingId === phase.id ? (
                  <>
                    <Button type="button" variant="ghost" size="sm" onClick={() => saveName(phase)} aria-label="Valider">
                      <Check className="h-4 w-4 text-moss-600" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)} aria-label="Annuler">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(phase.id);
                        setEditingName(phase.name);
                      }}
                      aria-label="Renommer"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {(permissions.owner || permissions.isSiteManager) && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPlanningId(planningId === phase.id ? null : phase.id)} aria-label="Budget et planning" title="Budget et planning prévus">
                        <Wallet className="h-4 w-4 text-blueprint-600" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => update.mutate({ phaseId: phase.id, payload: { isActive: !phase.isActive } })}
                      aria-label={phase.isActive ? 'Désactiver' : 'Réactiver'}
                      title={phase.isActive ? "Désactiver (n'apparaît plus dans la saisie)" : 'Réactiver'}
                    >
                      {phase.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setToDelete(phase)} aria-label="Supprimer">
                      <Trash2 className="h-4 w-4 text-clay-500" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {planningId === phase.id && (
              <PhaseBudgetPlanning
                phase={phase}
                canEditBudget={permissions.owner}
                saving={update.isPending}
                onSave={async (payload) => {
                  await update.mutateAsync({ phaseId: phase.id, payload });
                  setPlanningId(null);
                }}
              />
            )}
            </React.Fragment>
          ))}
        </div>

        <form onSubmit={add} className="mt-4 flex gap-2 border-t border-concrete pt-4">
          <Input value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} placeholder="Nouvelle étape (ex. Peinture)" />
          <Button type="submit" loading={create.isPending} disabled={newName.trim().length < 2}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </form>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          await remove.mutateAsync(toDelete.id).catch(() => undefined);
          setToDelete(null);
        }}
        title="Supprimer cette étape ?"
        description={
          toDelete && toDelete.workedDays > 0
            ? `« ${toDelete.name} » est utilisée par ${toDelete.workedDays} jour(s) travaillé(s) : elle ne peut pas être supprimée. Désactivez-la plutôt.`
            : toDelete
              ? `« ${toDelete.name} » sera supprimée définitivement.`
              : undefined
        }
        confirmLabel="Supprimer"
        danger
        loading={remove.isPending}
      />
    </>
  );
}


/** Budget prevu (client) et dates prevues (client, conducteur de travaux) d'une etape. */
function PhaseBudgetPlanning({
  phase,
  canEditBudget,
  saving,
  onSave,
}: {
  phase: ProjectPhase;
  canEditBudget: boolean;
  saving: boolean;
  onSave: (payload: { budgetAmount?: number | null; plannedStart?: string | null; plannedEnd?: string | null }) => Promise<void>;
}) {
  const [budget, setBudget] = React.useState(phase.budgetAmount ? String(parseFloat(phase.budgetAmount)) : '');
  const [start, setStart] = React.useState(phase.plannedStart ? phase.plannedStart.slice(0, 10) : '');
  const [end, setEnd] = React.useState(phase.plannedEnd ? phase.plannedEnd.slice(0, 10) : '');
  const invalid = !!start && !!end && start > end;

  return (
    <form
      className="-mt-1 space-y-3 rounded-xl border border-blueprint-100 bg-blueprint-50/50 px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (invalid) return;
        await onSave({
          ...(canEditBudget ? { budgetAmount: budget === '' ? null : Number(budget) } : {}),
          plannedStart: start || null,
          plannedEnd: end || null,
        });
      }}
    >
      <p className="text-xs font-medium text-blueprint-700">Budget et planning prévus de « {phase.name} »</p>
      {canEditBudget && (
        <FormField label="Budget de l'étape" hint="Laissez vide pour ne pas fixer de budget.">
          <Input type="number" inputMode="decimal" min={0} step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </FormField>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Début prévu">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </FormField>
        <FormField label="Fin prévue" error={invalid ? 'La fin précède le début.' : undefined}>
          <Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        </FormField>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={saving} disabled={invalid}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
