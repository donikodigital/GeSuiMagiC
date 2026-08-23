//src/app/(auth)/invitation/accept/page.tsx
'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { PageSpinner } from '@/components/ui/misc';

const schema = z
  .object({
    password: z.string().min(8, 'Au moins 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });
type FormValues = z.infer<typeof schema>;

function AcceptInvitationPageContent() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => authService.acceptInvitation(token, values.password),
    onSuccess: () => setDone(true),
    onError: (error: unknown) => toast.error(error instanceof ApiError ? error.message : 'Ce lien est invalide ou a expire.'),
  });

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss-50 text-moss-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-display text-xl font-semibold text-ink-900">Compte active</h1>
        <p className="mt-2 text-sm text-ink-500">Votre mot de passe a ete defini. Vous pouvez maintenant vous connecter.</p>
        <Button className="mt-6 w-full" onClick={() => router.push('/login')}>
          Aller a la connexion
        </Button>
      </div>
    );
  }

  if (!token) {
    return <p className="text-center text-sm text-clay-600">Ce lien d&apos;invitation est invalide.</p>;
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink-900">Bienvenue</h1>
      <p className="mt-1 text-sm text-ink-500">Definissez votre mot de passe pour activer votre compte.</p>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mt-8 space-y-4">
        <FormField label="Mot de passe" htmlFor="password" error={errors.password?.message} required>
          <Input id="password" type="password" {...register('password')} />
        </FormField>
        <FormField label="Confirmer le mot de passe" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
          <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
        </FormField>
        <Button type="submit" className="w-full" loading={mutation.isPending}>
          Activer mon compte
        </Button>
      </form>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <AcceptInvitationPageContent />
    </Suspense>
  );
}