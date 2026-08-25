// frontend/src/hooks/use-auth.ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/lib/auth-store';
import { ApiError } from '@/lib/api-client';

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, accessToken, hasHydrated, setSession, clear } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => authService.login(email, password),
    onSuccess: (data) => {
      setSession(data);
      const destination = data.user.role === 'SUPERVISOR' ? '/dashboard' : '/dashboard';
      router.push(destination);
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : 'Connexion impossible.';
      toast.error(message);
    },
  });

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // On deconnecte cote client meme si l'appel serveur echoue.
    }
    clear();
    queryClient.clear();
    router.push('/login');
  };

  return {
    user,
    // Tant que le store n'est pas rehydrate depuis le localStorage, on ne peut
    // pas savoir si l'utilisateur est authentifie : le garde de route doit
    // attendre `hasHydrated` avant de se fier a `isAuthenticated`.
    isAuthenticated: !!accessToken && !!user,
    hasHydrated,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    logout,
    isSuperadmin: user?.role === 'SUPERADMIN',
    isClient: user?.role === 'CLIENT',
    isSupervisor: user?.role === 'SUPERVISOR',
  };
}