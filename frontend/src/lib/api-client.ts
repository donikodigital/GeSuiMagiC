//frontend/src/lib/api-client.ts
import { useAuthStore } from './auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

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

/**
 * Rafraichit le token une seule fois meme si plusieurs requetes echouent en parallele.
 * Le serveur renvoie une NOUVELLE paire (access + refresh) : les deux sont enregistres,
 * sinon le refresh token deja consomme serait rejoue et la session invalidee.
 */
async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { refreshToken, setTokens, clear } = useAuthStore.getState();
      if (!refreshToken) {
        clear();
        throw new ApiError(401, 'NO_REFRESH_TOKEN', 'Session expiree.');
      }

      let res: Response;
      try {
        res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Panne reseau : la session n'est PAS invalidee, on pourra reessayer.
        throw new ApiError(0, 'NETWORK_ERROR', 'Impossible de joindre le serveur.');
      }

      if (!res.ok) {
        // Seul un refus explicite du serveur met fin a la session (pas une erreur 5xx passagere).
        if (res.status === 401 || res.status === 403 || res.status === 400) clear();
        throw new ApiError(401, 'REFRESH_FAILED', 'Session expiree, merci de vous reconnecter.');
      }

      const json = await res.json().catch(() => null);
      const accessToken: string | undefined = json?.data?.accessToken;
      if (!accessToken) {
        clear();
        throw new ApiError(401, 'REFRESH_FAILED', 'Session expiree, merci de vous reconnecter.');
      }
      setTokens({ accessToken, refreshToken: json?.data?.refreshToken });
      return accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * fetch authentifie : ajoute le jeton, transforme une panne reseau en ApiError,
 * et retente UNE fois apres rafraichissement en cas de 401 (access token expire).
 * Utilise aussi par downloadFile (avant, un telechargement echouait des que le
 * jeton d'acces de 15 minutes avait expire).
 */
async function authedFetch(path: string, init: RequestInit, skipAuth?: boolean): Promise<Response> {
  const doFetch = async (token: string | null) => {
    try {
      return await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Impossible de joindre le serveur. Verifiez votre connexion.');
    }
  };

  const token = skipAuth ? null : useAuthStore.getState().accessToken;
  let res = await doFetch(token);

  if (res.status === 401 && !skipAuth && useAuthStore.getState().refreshToken) {
    try {
      const newToken = await refreshAccessToken();
      res = await doFetch(newToken);
    } catch {
      // Le refresh a echoue, on laisse la 401 originale remonter.
    }
  }
  return res;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuth, headers, ...rest } = options;

  const res = await authedFetch(
    path,
    {
      ...rest,
      headers: { 'Content-Type': 'application/json', ...(headers as Record<string, string> | undefined) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    skipAuth,
  );

  const contentType = res.headers.get('content-type') ?? '';
  const isBinary = res.ok && (contentType.includes('application/pdf') || contentType.includes('spreadsheetml'));
  if (isBinary) {
    return (await res.blob()) as unknown as T;
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, json?.code ?? 'UNKNOWN_ERROR', json?.message ?? 'Une erreur est survenue.', json?.details);
  }

  // Reponse sans corps (204...) : pas de donnees plutot qu'un plantage sur `null.data`.
  return (json?.data ?? undefined) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  // body optionnel : la plupart des DELETE n'en ont pas besoin, mais certains
  // (ex. suppression logique d'un depot/depense) exigent un motif dans le corps.
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'DELETE', body }),
};

/** Extrait le nom de fichier d'un en-tete Content-Disposition (filename* en UTF-8 prioritaire). */
function filenameFromDisposition(disposition: string | null): string | undefined {
  if (!disposition) return undefined;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // on retombe sur filename="..."
    }
  }
  return disposition.match(/filename="([^"]+)"/i)?.[1];
}

/** Telecharge un fichier binaire (PDF/Excel) et declenche le "Save As" du navigateur. */
export async function downloadFile(path: string, filenameFallback: string) {
  const res = await authedFetch(path, { method: 'GET' });
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Le telechargement a echoue.');
  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get('content-disposition')) ?? filenameFallback;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
