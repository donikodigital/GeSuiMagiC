// frontend/src/components/catalog/category-detail-dialog.tsx
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
import type { ExpenseCategory } from '@/types/models';

export function CategoryDetailDialog({ open, onClose, category }: { open: boolean; onClose: () => void; category: ExpenseCategory }) {
  const queryClient = useQueryClient();
  const { isSuperadmin } = useAuth();
  const [isEditing, setIsEditing] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [name, setName] = React.useState(category.name);
  const [group, setGroup] = React.useState(category.group ?? '');

  React.useEffect(() => {
    if (open) {
      setIsEditing(false);
      setConfirmingDelete(false);
      setName(category.name);
      setGroup(category.group ?? '');
    }
  }, [open, category]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories'] });

  const updateMutation = useMutation({
    mutationFn: () => catalogService.categories.update(category.id, { name, group: group || undefined }),
    onSuccess: () => {
      invalidate();
      toast.success('Categorie mise a jour.');
      setIsEditing(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Mise a jour impossible.'),
  });

  const toggleMutation = useMutation({
    mutationFn: () => (category.isActive ? catalogService.categories.deactivate(category.id) : catalogService.categories.reactivate(category.id)),
    onSuccess: () => {
      invalidate();
      toast.success(category.isActive ? 'Categorie desactivee.' : 'Categorie reactivee.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de modifier le statut.'),
  });

  const removeMutation = useMutation({
    mutationFn: () => catalogService.categories.remove(category.id),
    onSuccess: () => {
      invalidate();
      toast.success('Categorie supprimee.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de supprimer cette categorie.'),
  });

  if (isEditing) {
    return (
      <Dialog open={open} onClose={onClose} title="Modifier la categorie">
        <div className="space-y-4">
          <FormField label="Nom" htmlFor="cat-edit-name" required>
            <Input id="cat-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Groupe (affichage)" htmlFor="cat-edit-group">
            <Input id="cat-edit-group" value={group} onChange={(e) => setGroup(e.target.value)} />
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
    <Dialog open={open} onClose={onClose} title={category.name} description={category.group || 'Sans groupe'}>
      <div className="mb-4">
        <StatusBadge label={category.isActive ? 'Actif' : 'Desactive'} tone={category.isActive ? 'moss' : 'ink'} />
      </div>

      {!isSuperadmin ? (
        <div className="flex justify-end border-t border-concrete pt-4">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      ) : confirmingDelete ? (
        <div className="rounded-card border border-clay-200 bg-clay-50 p-4">
          <p className="text-sm text-clay-600">Confirmer la suppression definitive de cette categorie ? Cette action est irreversible.</p>
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
            {category.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {category.isActive ? 'Desactiver' : 'Reactiver'}
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