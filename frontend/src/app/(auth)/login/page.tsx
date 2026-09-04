// ============================================================================
// app/(auth)/login/page.tsx - v1.1
// Ajout d'un bouton oeil pour afficher/masquer la saisie du mot de passe.
// tabIndex=-1 sur le bouton pour ne pas casser l'ordre de tabulation
// (email -> mot de passe -> se connecter).
// ============================================================================

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: FormValues) => login(values);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink-900">Connexion</h1>
      <p className="mt-1 text-sm text-ink-500">Accédez à votre espace de suivi de chantier.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
        <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" placeholder="vous@exemple.com" {...register('email')} />
        </FormField>

        <FormField label="Mot de passe" htmlFor="password" error={errors.password?.message} required>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-10"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 transition hover:text-ink-600"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FormField>

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-blueprint-600 hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>

        <Button type="submit" className="w-full" loading={isLoggingIn}>
          Se connecter
        </Button>
      </form>
    </div>
  );
}