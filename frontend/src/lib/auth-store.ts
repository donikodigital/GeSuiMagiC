import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CurrentUser } from '@/types/models';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: CurrentUser | null;
  setSession: (data: { accessToken: string; refreshToken: string; user: CurrentUser }) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ accessToken, refreshToken, user }) => set({ accessToken, refreshToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'chantier-auth' },
  ),
);
