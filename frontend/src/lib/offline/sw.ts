//frontend/src/lib/offline/sw.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/** Enregistre le service worker (production uniquement : en developpement il masquerait les changements). */
export async function registerServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV !== 'production') return;
  try {
    await navigator.serviceWorker.register(`/sw.js?api=${encodeURIComponent(API_URL)}`, { scope: '/' });
  } catch {
    // Pas de service worker (navigation privee, navigateur ancien) : l'application fonctionne normalement en ligne.
  }
}

/** Vide les copies locales des donnees de l'API : a appeler a la connexion et a la deconnexion (jamais de donnees d'un autre compte). */
export async function clearOfflineCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage({ type: 'CLEAR_API_CACHE' });
  } catch {
    // sans effet
  }
}
