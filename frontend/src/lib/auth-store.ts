//frontend/src/lib/auth-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CurrentUser } from '@/types/models';

const STORAGE_KEY = 'chantier-auth';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: CurrentUser | null;
  hasHydrated: boolean;
  setSession: (data: { accessToken: string; refreshToken: string; user: CurrentUser }) => void;
  /** Le serveur fait tourner le refresh token a chaque rafraichissement : les DEUX jetons doivent etre conserves. */
  setTokens: (data: { accessToken: string; refreshToken?: string }) => void;
  clear: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      hasHydrated: false,
      setSession: ({ accessToken, refreshToken, user }) => set({ accessToken, refreshToken, user }),
      setTokens: ({ accessToken, refreshToken }) => set((state) => ({ accessToken, refreshToken: refreshToken ?? state.refreshToken })),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: STORAGE_KEY,
      // hasHydrated ne doit jamais etre persiste, sinon il repart avec la
      // valeur sauvegardee au lieu de repartir a false a chaque chargement.
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/**
 * Synchronisation entre onglets. Le refresh token est a usage unique cote
 * serveur : si l'onglet A le renouvelle, l'onglet B garderait l'ancien en
 * memoire, et son prochain rafraichissement serait pris pour un vol de jeton
 * (session invalidee). On relit donc le stockage des qu'un autre onglet le modifie
 * (connexion, rotation, deconnexion).
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      void useAuthStore.persist.rehydrate();
    }
  });
}
