//frontend/src/app/(auth)/reset-password/page.tsx
'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
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

function ResetPasswordPageContent() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => authService.resetPassword(token, values.password),
    onSuccess: () => {
      setDone(true);
      toast.success('Mot de passe reinitialise.');
      setTimeout(() => router.push('/login'), 1500);
    },
    onError: (error: unknown) => toast.error(error instanceof ApiError ? error.message : 'Ce lien est invalide ou a expiré.'),
  });

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-sm text-clay-600">Ce lien est invalide. Merci de refaire une demande de réinitialisation.</p>
        <Link href="/forgot-password" className="mt-4 inline-block text-sm text-blueprint-600 hover:underline">
          Nouvelle demande
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink-900">Nouveau mot de passe</h1>
      <p className="mt-1 text-sm text-ink-500">Choisissez un mot de passe robuste.</p>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mt-8 space-y-4">
        <FormField label="Nouveau mot de passe" htmlFor="password" error={errors.password?.message} required>
          <Input id="password" type="password" {...register('password')} />
        </FormField>
        <FormField label="Confirmer le mot de passe" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
          <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
        </FormField>
        <Button type="submit" className="w-full" loading={mutation.isPending} disabled={done}>
          Réinitialiser le mot de passe
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}