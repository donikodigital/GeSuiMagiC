//frontend/src/app/(auth)/forgot-password/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';

const schema = z.object({ email: z.string().email('Adresse email invalide') });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => authService.forgotPassword(values.email),
    onSuccess: () => setSent(true),
  });

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss-50 text-moss-600">
          <MailCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-display text-xl font-semibold text-ink-900">Vérifiez votre boîte mail</h1>
        <p className="mt-2 text-sm text-ink-500">
          Si cette adresse est associée à un compte, un lien de réinitialisation vient d&apos;être envoyé.
        </p>
        <Link href="/login" className="mt-6 inline-flex items-center gap-1 text-sm text-blueprint-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink-900">Mot de passe oublie</h1>
      <p className="mt-1 text-sm text-ink-500">Recevez un lien pour reinitialiser votre mot de passe.</p>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mt-8 space-y-4">
        <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </FormField>
        <Button type="submit" className="w-full" loading={mutation.isPending}>
          Envoyer le lien
        </Button>
        <Link href="/login" className="flex items-center justify-center gap-1 text-sm text-ink-500 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Retour à la connexion
        </Link>
      </form>
    </div>
  );
}
