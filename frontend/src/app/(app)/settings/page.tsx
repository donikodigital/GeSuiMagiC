'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { clientsService } from '@/services/clients.service';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { api } from '@/lib/api-client';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Requis'),
    newPassword: z.string().min(8, 'Au moins 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: 'Les mots de passe ne correspondent pas', path: ['confirmPassword'] });
type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const { isSuperadmin, isClient } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });

  const changePasswordMutation = useMutation({
    mutationFn: (values: PasswordFormValues) => authService.changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      toast.success('Mot de passe modifie.');
      reset();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de modifier le mot de passe.'),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Reglages" />

      {isClient && <ClientProfileCard />}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Mot de passe</CardTitle>
            <CardDescription>Modifiez le mot de passe de votre compte.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((v) => changePasswordMutation.mutate(v))} className="space-y-4">
            <FormField label="Mot de passe actuel" htmlFor="currentPassword" required error={errors.currentPassword?.message}>
              <Input id="currentPassword" type="password" {...register('currentPassword')} />
            </FormField>
            <FormField label="Nouveau mot de passe" htmlFor="newPassword" required error={errors.newPassword?.message}>
              <Input id="newPassword" type="password" {...register('newPassword')} />
            </FormField>
            <FormField label="Confirmer" htmlFor="confirmPassword" required error={errors.confirmPassword?.message}>
              <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
            </FormField>
            <div className="flex justify-end">
              <Button type="submit" loading={changePasswordMutation.isPending}>
                Modifier le mot de passe
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isSuperadmin && <GlobalSettingsCard />}
    </div>
  );
}

interface SettingRow {
  id: string;
  key: string;
  value: unknown;
}

const profileSchema = z.object({
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  profession: z.string().optional(),
});
type ProfileFormValues = z.infer<typeof profileSchema>;

function ClientProfileCard() {
  const queryClient = useQueryClient();
  const { data: client, isLoading } = useQuery({ queryKey: ['clients', 'me'], queryFn: () => clientsService.me() });
  const { register, handleSubmit, reset } = useForm<ProfileFormValues>();

  React.useEffect(() => {
    if (client) reset({ phone: client.phone ?? '', address: client.address ?? '', city: client.city ?? '', profession: client.profession ?? '' });
  }, [client, reset]);

  const mutation = useMutation({
    mutationFn: (values: ProfileFormValues) => clientsService.updateMe(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', 'me'] });
      toast.success('Profil mis a jour.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Mise a jour impossible.'),
  });

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Mon profil</CardTitle>
          <CardDescription>
            {client?.firstName} {client?.lastName} — {client?.user?.email}. Seules certaines informations personnelles sont modifiables.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Telephone" htmlFor="phone">
              <Input id="phone" {...register('phone')} />
            </FormField>
            <FormField label="Profession" htmlFor="profession">
              <Input id="profession" {...register('profession')} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Adresse" htmlFor="address">
              <Input id="address" {...register('address')} />
            </FormField>
            <FormField label="Ville" htmlFor="city">
              <Input id="city" {...register('city')} />
            </FormField>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={mutation.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function GlobalSettingsCard() {
  const queryClient = useQueryClient();
  const [key, setKey] = React.useState('');
  const [value, setValue] = React.useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings', 'global'],
    queryFn: () => api.get<SettingRow[]>('/settings'),
  });

  const saveMutation = useMutation({
    mutationFn: () => api.post('/settings', { key, value: safeParse(value) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'global'] });
      setKey('');
      setValue('');
      toast.success('Reglage enregistre.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Enregistrement impossible.'),
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Reglages globaux</CardTitle>
          <CardDescription>Parametres de la plateforme (avances).</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Cle</label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Ex: default_currency" />
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Valeur (JSON ou texte)</label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder='Ex: "GNF"' />
          </div>
          <Button disabled={!key || !value} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            <Plus className="h-4 w-4" /> Enregistrer
          </Button>
        </div>

        {!isLoading && settings && settings.length > 0 && (
          <ul className="divide-y divide-concrete rounded-card border border-concrete">
            {settings.map((s) => (
              <li key={s.id} className="flex justify-between px-4 py-2.5 text-sm">
                <span className="font-medium text-ink-800">{s.key}</span>
                <span className="font-ledger text-ink-500">{JSON.stringify(s.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
