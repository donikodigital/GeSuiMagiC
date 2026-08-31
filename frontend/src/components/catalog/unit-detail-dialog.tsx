// frontend/src/components/catalog/unit-detail-dialog.tsx
'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { catalogService } from '@/services/catalog.service';
import { useAuth } from '@/hooks/use-auth';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api-client';
import type { Unit } from '@/types/models';

export function UnitDetailDialog({ open, onClose, unit }: { open: boolean; onClose: () => void; unit: Unit }) {
  const queryClient = useQueryClient();
  const { isSuperadmin } = useAuth();
  const [isEditing, setIsEditing] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [name, setName] = React.useState(unit.name);
  const [symbol, setSymbol] = React.useState(unit.symbol ?? '');

  React.useEffect(() => {
    if (open) {
      setIsEditing(false);
      setConfirmingDelete(false);
      setName(unit.name);
      setSymbol(unit.symbol ?? '');
    }
  }, [open, unit]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['units'] });

  const updateMutation = useMutation({
    mutationFn: () => catalogService.units.update(unit.id, { name, symbol: symbol || undefined }),
    onSuccess: () => {
      invalidate();
      toast.success('Unite mise a jour.');
      setIsEditing(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Mise a jour impossible.'),
  });

  const toggleMutation = useMutation({
    mutationFn: () => (unit.isActive ? catalogService.units.deactivate(unit.id) : catalogService.units.reactivate(unit.id)),
    onSuccess: () => {
      invalidate();
      toast.success(unit.isActive ? 'Unite desactivee.' : 'Unite reactivee.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de modifier le statut.'),
  });

  const removeMutation = useMutation({
    mutationFn: () => catalogService.units.remove(unit.id),
    onSuccess: () => {
      invalidate();
      toast.success('Unite supprimee.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de supprimer cette unite.'),
  });

  if (isEditing) {
    return (
      <Dialog open={open} onClose={onClose} title="Modifier l'unite">
        <div className="space-y-4">
          <FormField label="Nom" htmlFor="unit-edit-name" required>
            <Input id="unit-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Symbole" htmlFor="unit-edit-symbol">
            <Input id="unit-edit-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          </FormField>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsEditing(false)}>
            Annuler
          </Button>
          <Button onClick={() => updateMutation.mutate()} loading={updateMutation.isPending} disabled={!name.trim()}>
            Enregistrer
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={unit.name} description={unit.symbol || undefined}>
      <div className="mb-4">
        <StatusBadge label={unit.isActive ? 'Actif' : 'Desactive'} tone={unit.isActive ? 'moss' : 'ink'} />
      </div>

      {!isSuperadmin ? (
        <div className="flex justify-end border-t border-concrete pt-4">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      ) : confirmingDelete ? (
        <div className="rounded-card border border-clay-200 bg-clay-50 p-4">
          <p className="text-sm text-clay-600">Confirmer la suppression definitive de cette unite ? Cette action est irreversible.</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}>
              Annuler
            </Button>
            <Button variant="danger" size="sm" onClick={() => removeMutation.mutate()} loading={removeMutation.isPending}>
              Confirmer la suppression
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-concrete pt-4">
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4" /> Modifier
          </Button>
          <Button variant="outline" loading={toggleMutation.isPending} onClick={() => toggleMutation.mutate()}>
            {unit.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {unit.isActive ? 'Desactiver' : 'Reactiver'}
          </Button>
          <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
            <Trash2 className="h-4 w-4" /> Supprimer
          </Button>
          <Button variant="outline" onClick={onClose} className="ml-auto">
            Fermer
          </Button>
        </div>
      )}
    </Dialog>
  );
}