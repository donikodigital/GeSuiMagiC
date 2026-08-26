// frontend/src/components/clients/edit-client-dialog.tsx
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clientsService } from '@/services/clients.service';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import type { ClientProfile } from '@/types/models';

const schema = z.object({
  firstName: z.string().min(1, 'Requis'),
  lastName: z.string().min(1, 'Requis'),
  phone: z.string().optional(),
  profession: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  companyName: z.string().optional(),
  companyAddress: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function EditClientDialog({ open, onClose, client }: { open: boolean; onClose: () => void; client: ClientProfile }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  React.useEffect(() => {
    if (open) {
      reset({
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone ?? '',
        profession: client.profession ?? '',
        address: client.address ?? '',
        city: client.city ?? '',
        country: client.country ?? '',
        companyName: client.companyName ?? '',
        companyAddress: client.companyAddress ?? '',
      });
    }
  }, [open, client, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => clientsService.update(client.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', client.id] });
      toast.success('Client mis a jour.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de mettre a jour ce client.'),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Modifier le client" description="Ces informations sont modifiables uniquement par le superadministrateur.">
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Prenom" htmlFor="edit-firstName" required error={errors.firstName?.message}>
            <Input id="edit-firstName" {...register('firstName')} />
          </FormField>
          <FormField label="Nom" htmlFor="edit-lastName" required error={errors.lastName?.message}>
            <Input id="edit-lastName" {...register('lastName')} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Telephone" htmlFor="edit-phone">
            <Input id="edit-phone" {...register('phone')} />
          </FormField>
          <FormField label="Profession" htmlFor="edit-profession">
            <Input id="edit-profession" {...register('profession')} />
          </FormField>
        </div>

        <FormField label="Adresse" htmlFor="edit-address">
          <Input id="edit-address" {...register('address')} />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Ville" htmlFor="edit-city">
            <Input id="edit-city" {...register('city')} />
          </FormField>
          <FormField label="Pays" htmlFor="edit-country">
            <Input id="edit-country" {...register('country')} />
          </FormField>
        </div>

        <FormField label="Societe" htmlFor="edit-companyName">
          <Input id="edit-companyName" {...register('companyName')} />
        </FormField>

        <FormField label="Adresse de la societe" htmlFor="edit-companyAddress">
          <Input id="edit-companyAddress" {...register('companyAddress')} />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}