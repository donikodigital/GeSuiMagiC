//frontend/src/lib/geo.ts
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Position de l'appareil pour le controle anti-fraude (jamais bloquant) : renvoie undefined si l'utilisateur refuse,
 * si la position n'est pas disponible ou si elle met trop longtemps (reseau/GPS faible sur chantier).
 */
export function getPosition(timeoutMs = 5000): Promise<GeoPoint | undefined> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(undefined), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        resolve({ latitude: Math.round(pos.coords.latitude * 1e6) / 1e6, longitude: Math.round(pos.coords.longitude * 1e6) / 1e6 });
      },
      () => {
        window.clearTimeout(timer);
        resolve(undefined);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** Identifiant genere par l'appareil : un rejeu apres une coupure ne cree jamais deux fois la meme saisie. */
export function newClientRef(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}
