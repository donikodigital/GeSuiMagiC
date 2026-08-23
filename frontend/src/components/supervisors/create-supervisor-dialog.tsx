'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supervisorsService } from '@/services/supervisors.service';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';

const schema = z.object({
  email: z.string().email('Adresse email invalide'),
  firstName: z.string().min(1, 'Requis'),
  lastName: z.string().min(1, 'Requis'),
  phone: z.string().optional(),
  profession: z.string().optional(),
  address: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function CreateSupervisorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => supervisorsService.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      toast.success('Superviseur cree - une invitation par email vient de lui etre envoyee.');
      reset();
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de creer ce superviseur.'),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Nouveau superviseur" description="Un email d'invitation securise lui sera envoye automatiquement.">
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Prenom" htmlFor="firstName" required error={errors.firstName?.message}>
            <Input id="firstName" {...register('firstName')} />
          </FormField>
          <FormField label="Nom" htmlFor="lastName" required error={errors.lastName?.message}>
            <Input id="lastName" {...register('lastName')} />
          </FormField>
        </div>
        <FormField label="Email" htmlFor="email" required error={errors.email?.message}>
          <Input id="email" type="email" {...register('email')} />
        </FormField>
        <FormField label="Telephone" htmlFor="phone">
          <Input id="phone" {...register('phone')} />
        </FormField>
        <FormField label="Profession" htmlFor="profession">
          <Input id="profession" {...register('profession')} />
        </FormField>
        <FormField label="Adresse" htmlFor="address">
          <Input id="address" {...register('address')} />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Creer et inviter
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
