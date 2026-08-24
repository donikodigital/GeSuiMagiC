//frontend/src/lib/api-client.ts
import { useAuthStore } from './auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
}

let refreshPromise: Promise<string> | null = null;

/** Rafraichit le token une seule fois meme si plusieurs requetes echouent en parallele. */
async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { refreshToken, setAccessToken, clear } = useAuthStore.getState();
      if (!refreshToken) {
        clear();
        throw new ApiError(401, 'NO_REFRESH_TOKEN', 'Session expiree.');
      }
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clear();
        throw new ApiError(401, 'REFRESH_FAILED', 'Session expiree, merci de vous reconnecter.');
      }
      const json = await res.json();
      const accessToken = json.data.accessToken as string;
      setAccessToken(accessToken);
      return accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuth, headers, ...rest } = options;

  const doFetch = async (token: string | null) => {
    const res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res;
  };

  const token = skipAuth ? null : useAuthStore.getState().accessToken;
  let res = await doFetch(token);

  // Retente une fois apres un refresh en cas de 401 (access token expire).
  if (res.status === 401 && !skipAuth && useAuthStore.getState().refreshToken) {
    try {
      const newToken = await refreshAccessToken();
      res = await doFetch(newToken);
    } catch {
      // Le refresh a echoue, on laisse la 401 originale remonter.
    }
  }

  const isBinary = res.headers.get('content-type')?.includes('application/pdf') || res.headers.get('content-type')?.includes('spreadsheetml');
  if (isBinary) {
    return (await res.blob()) as unknown as T;
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, json?.code ?? 'UNKNOWN_ERROR', json?.message ?? 'Une erreur est survenue.', json?.details);
  }

  return json.data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'DELETE' }),
};

/** Telecharge un fichier binaire (PDF/Excel) et declenche le "Save As" du navigateur. */
export async function downloadFile(path: string, filenameFallback: string) {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Le telechargement a echoue.');
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition');
  const match = disposition?.match(/filename="(.+)"/);
  const filename = match?.[1] ?? filenameFallback;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
