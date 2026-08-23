import { api } from '@/lib/api-client';
import type { CurrentUser } from '@/types/models';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: CurrentUser;
}

export const authService = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }, { skipAuth: true }),

  logout: () => api.post('/auth/logout'),

  acceptInvitation: (token: string, password: string) =>
    api.post('/auth/accept-invitation', { token, password }, { skipAuth: true }),

  forgotPassword: (email: string) => api.post<{ message: string }>('/auth/forgot-password', { email }, { skipAuth: true }),

  resetPassword: (token: string, password: string) =>
    api.post<{ message: string }>('/auth/reset-password', { token, password }, { skipAuth: true }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ message: string }>('/auth/change-password', { currentPassword, newPassword }),
};
