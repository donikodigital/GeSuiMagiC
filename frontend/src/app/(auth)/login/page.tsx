'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';

const schema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(1, 'Le mot de passe est requis'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login, isLoggingIn } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: FormValues) => login(values);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink-900">Connexion</h1>
      <p className="mt-1 text-sm text-ink-500">Accedez a votre espace de suivi de chantier.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
        <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" placeholder="vous@exemple.com" {...register('email')} />
        </FormField>

        <FormField label="Mot de passe" htmlFor="password" error={errors.password?.message} required>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
        </FormField>

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-blueprint-600 hover:underline">
            Mot de passe oublie ?
          </Link>
        </div>

        <Button type="submit" className="w-full" loading={isLoggingIn}>
          Se connecter
        </Button>
      </form>
    </div>
  );
}
