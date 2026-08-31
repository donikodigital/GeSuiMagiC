// frontend/src/app/(app)/settings/page.tsx - v3.2
// Fix : l'email etait accole au nom dans CardDescription (className=
// "truncate"), et se faisait couper des que le nom+email depassait la
// largeur disponible (visible sur "jallow..."). L'email sort du sous-titre
// et recoit sa propre ProfileRow (icone Mail), comme Telephone/Profession/
// Adresse/Ville - meme traitement applique a ClientProfileCard et
// SupervisorProfileCard pour rester coherent. Le sous-titre ne garde que
// le nom complet. Aucun changement de logique/mutations.

'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Briefcase, KeyRound, Mail, MapPin, Pencil, Phone, ShieldCheck, UserCircle2 } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { clientsService } from '@/services/clients.service';
import { supervisorsService } from '@/services/supervisors.service';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { FormField, Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Requis'),
    newPassword: z.string().min(8, 'Au moins 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: 'Les mots de passe ne correspondent pas', path: ['confirmPassword'] });
type PasswordFormValues = z.infer<typeof passwordSchema>;

function SectionIcon({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function ProfileRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 border-b border-concrete-light py-2.5 last:border-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-ink-400">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
        <p className="truncate text-sm font-medium text-ink-800">{value || '-'}</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { isSuperadmin, isClient, isSupervisor } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-4">
      <PageHeader title="Réglages" />

      {isClient && <ClientProfileCard />}
      {isSupervisor && <SupervisorProfileCard />}
      {isSuperadmin && <SuperadminProfileCard />}

      <PasswordCard />
    </div>
  );
}

function PasswordCard() {
  const [isEditing, setIsEditing] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });

  const changePasswordMutation = useMutation({
    mutationFn: (values: PasswordFormValues) => authService.changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      toast.success('Mot de passe modifié.');
      reset();
      setIsEditing(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de modifier le mot de passe.'),
  });

  return (
    <Card>
      <CardHeader className="items-start gap-3">
        <SectionIcon icon={KeyRound} />
        <div>
          <CardTitle>Mot de passe</CardTitle>
          <CardDescription>Modifiez le mot de passe de votre compte.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {!isEditing ? (
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4" /> Modifier le mot de passe
          </Button>
        ) : (
          <form onSubmit={handleSubmit((v) => changePasswordMutation.mutate(v))} className="space-y-4">
            <FormField label="Mot de passe actuel" htmlFor="currentPassword" required error={errors.currentPassword?.message}>
              <Input id="currentPassword" type="password" autoComplete="current-password" {...register('currentPassword')} />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Nouveau mot de passe" htmlFor="newPassword" required error={errors.newPassword?.message}>
                <Input id="newPassword" type="password" autoComplete="new-password" {...register('newPassword')} />
              </FormField>
              <FormField label="Confirmer" htmlFor="confirmPassword" required error={errors.confirmPassword?.message}>
                <Input id="confirmPassword" type="password" autoComplete="new-password" {...register('confirmPassword')} />
              </FormField>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  setIsEditing(false);
                }}
              >
                Annuler
              </Button>
              <Button type="submit" loading={changePasswordMutation.isPending}>
                Modifier le mot de passe
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
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
  const [isEditing, setIsEditing] = React.useState(false);
  const { register, handleSubmit, reset } = useForm<ProfileFormValues>();

  React.useEffect(() => {
    if (client) reset({ phone: client.phone ?? '', address: client.address ?? '', city: client.city ?? '', profession: client.profession ?? '' });
  }, [client, reset]);

  const mutation = useMutation({
    mutationFn: (values: ProfileFormValues) => clientsService.updateMe(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', 'me'] });
      toast.success('Profil mis a jour.');
      setIsEditing(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Mise à jour impossible.'),
  });

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader className="flex-wrap items-start gap-3">
        <SectionIcon icon={UserCircle2} />
        <div className="min-w-0 flex-1">
          <CardTitle>Mon profil</CardTitle>
          <CardDescription className="truncate">
            {client?.firstName} {client?.lastName}
          </CardDescription>
        </div>
        {!isEditing && (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4" /> Modifier
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!isEditing ? (
          <div>
            <ProfileRow icon={Mail} label="Email" value={client?.user?.email} />
            <ProfileRow icon={Phone} label="Téléphone" value={client?.phone} />
            <ProfileRow icon={Briefcase} label="Profession" value={client?.profession} />
            <ProfileRow icon={MapPin} label="Adresse" value={client?.address} />
            <ProfileRow icon={MapPin} label="Ville" value={client?.city} />
          </div>
        ) : (
          <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Telephone" htmlFor="phone">
                <Input id="phone" {...register('phone')} />
              </FormField>
              <FormField label="Profession" htmlFor="profession">
                <Input id="profession" {...register('profession')} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Adresse" htmlFor="address">
                <Input id="address" {...register('address')} />
              </FormField>
              <FormField label="Ville" htmlFor="city">
                <Input id="city" {...register('city')} />
              </FormField>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Enregistrer
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

const supervisorProfileSchema = z.object({
  phone: z.string().optional(),
  address: z.string().optional(),
  profession: z.string().optional(),
});
type SupervisorProfileFormValues = z.infer<typeof supervisorProfileSchema>;

function SupervisorProfileCard() {
  const queryClient = useQueryClient();
  const { data: supervisor, isLoading } = useQuery({ queryKey: ['supervisors', 'me'], queryFn: () => supervisorsService.me() });
  const [isEditing, setIsEditing] = React.useState(false);
  const { register, handleSubmit, reset } = useForm<SupervisorProfileFormValues>();

  React.useEffect(() => {
    if (supervisor) reset({ phone: supervisor.phone ?? '', address: supervisor.address ?? '', profession: supervisor.profession ?? '' });
  }, [supervisor, reset]);

  const mutation = useMutation({
    mutationFn: (values: SupervisorProfileFormValues) => supervisorsService.updateMe(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors', 'me'] });
      toast.success('Profil mis a jour.');
      setIsEditing(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Mise à jour impossible.'),
  });

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader className="flex-wrap items-start gap-3">
        <SectionIcon icon={UserCircle2} />
        <div className="min-w-0 flex-1">
          <CardTitle>Mon profil</CardTitle>
          <CardDescription className="truncate">
            {supervisor?.firstName} {supervisor?.lastName}
          </CardDescription>
        </div>
        {!isEditing && (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4" /> Modifier
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!isEditing ? (
          <div>
            <ProfileRow icon={Mail} label="Email" value={supervisor?.user?.email} />
            <ProfileRow icon={Phone} label="Téléphone" value={supervisor?.phone} />
            <ProfileRow icon={Briefcase} label="Profession" value={supervisor?.profession} />
            <ProfileRow icon={MapPin} label="Adresse" value={supervisor?.address} />
          </div>
        ) : (
          <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Telephone" htmlFor="sup-phone">
                <Input id="sup-phone" {...register('phone')} />
              </FormField>
              <FormField label="Profession" htmlFor="sup-profession">
                <Input id="sup-profession" {...register('profession')} />
              </FormField>
            </div>
            <FormField label="Adresse" htmlFor="sup-address">
              <Input id="sup-address" {...register('address')} />
            </FormField>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Enregistrer
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function SuperadminProfileCard() {
  const { user } = useAuth();

  return (
    <Card>
      <CardHeader className="items-start gap-3">
        <SectionIcon icon={ShieldCheck} />
        <div>
          <CardTitle>Mon profil</CardTitle>
          <CardDescription>Informations de votre compte superadministrateur.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ProfileRow icon={Mail} label="Email" value={user?.email} />
        <div className="flex items-center gap-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-ink-400">
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-400">Rôle</p>
            <StatusBadge label="Superadministrateur" tone="blueprint" className="mt-0.5" />
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-400">
          Le nom et les autres informations de profil ne sont pas encore gerés pour les comptes superadministrateur.
        </p>
      </CardContent>
    </Card>
  );
}