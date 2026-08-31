// frontend/src/components/catalog/material-detail-dialog.tsx
'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { catalogService } from '@/services/catalog.service';
import { useCategories, useUnits } from '@/hooks/use-catalog';
import { useAuth } from '@/hooks/use-auth';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api-client';
import type { Material } from '@/types/models';

export function MaterialDetailDialog({ open, onClose, material }: { open: boolean; onClose: () => void; material: Material }) {
  const queryClient = useQueryClient();
  const { isSuperadmin } = useAuth();
  const { data: categories } = useCategories(true);
  const { data: units } = useUnits(true);
  const [isEditing, setIsEditing] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [name, setName] = React.useState(material.name);
  const [categoryId, setCategoryId] = React.useState(material.categoryId);
  const [defaultUnitId, setDefaultUnitId] = React.useState(material.defaultUnit?.id ?? '');

  React.useEffect(() => {
    if (open) {
      setIsEditing(false);
      setConfirmingDelete(false);
      setName(material.name);
      setCategoryId(material.categoryId);
      setDefaultUnitId(material.defaultUnit?.id ?? '');
    }
  }, [open, material]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['materials'] });

  const updateMutation = useMutation({
    mutationFn: () => catalogService.materials.update(material.id, { name, categoryId, defaultUnitId: defaultUnitId || undefined }),
    onSuccess: () => {
      invalidate();
      toast.success('Materiau mis a jour.');
      setIsEditing(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Mise a jour impossible.'),
  });

  const toggleMutation = useMutation({
    mutationFn: () => (material.isActive ? catalogService.materials.deactivate(material.id) : catalogService.materials.reactivate(material.id)),
    onSuccess: () => {
      invalidate();
      toast.success(material.isActive ? 'Materiau desactive.' : 'Materiau reactive.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de modifier le statut.'),
  });

  const removeMutation = useMutation({
    mutationFn: () => catalogService.materials.remove(material.id),
    onSuccess: () => {
      invalidate();
      toast.success('Materiau supprime.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de supprimer ce materiau.'),
  });

  if (isEditing) {
    return (
      <Dialog open={open} onClose={onClose} title="Modifier le materiau">
        <div className="space-y-4">
          <FormField label="Nom" htmlFor="mat-edit-name" required>
            <Input id="mat-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Categorie" htmlFor="mat-edit-category" required>
            <Select id="mat-edit-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Unite par defaut" htmlFor="mat-edit-unit">
            <Select id="mat-edit-unit" value={defaultUnitId} onChange={(e) => setDefaultUnitId(e.target.value)}>
              <option value="">-</option>
              {units?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsEditing(false)}>
            Annuler
          </Button>
          <Button onClick={() => updateMutation.mutate()} loading={updateMutation.isPending} disabled={!name.trim() || !categoryId}>
            Enregistrer
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={material.name} description={material.category?.name || 'Sans categorie'}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge label={material.isActive ? 'Actif' : 'Desactive'} tone={material.isActive ? 'moss' : 'ink'} />
        {material.defaultUnit?.name && <span className="text-xs text-ink-400">Unite par defaut : {material.defaultUnit.name}</span>}
      </div>

      {!isSuperadmin ? (
        <div className="flex justify-end border-t border-concrete pt-4">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      ) : confirmingDelete ? (
        <div className="rounded-card border border-clay-200 bg-clay-50 p-4">
          <p className="text-sm text-clay-600">Confirmer la suppression definitive de ce materiau ? Cette action est irreversible.</p>
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
            {material.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {material.isActive ? 'Desactiver' : 'Reactiver'}
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