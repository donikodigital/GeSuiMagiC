//backend/src/common/utils/geo.util.ts
import { Prisma } from '@prisma/client';

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distance a vol d'oiseau en metres entre deux points GPS (formule de haversine). */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a))));
}

export interface SiteLocation {
  siteLatitude: Prisma.Decimal | number | null;
  siteLongitude: Prisma.Decimal | number | null;
  geoFenceMeters: number;
}

export interface LocationAssessment {
  /** Position fournie par l'appareil (null si l'utilisateur n'a pas partage sa position). */
  latitude: number | null;
  longitude: number | null;
  /** Distance au chantier (null si la position ou les coordonnees du chantier manquent). */
  distanceMeters: number | null;
  /** Vrai si la saisie a ete faite au-dela du rayon autorise. Faux si on ne peut pas conclure. */
  isOffSite: boolean;
}

/**
 * Compare la position d'une saisie aux coordonnees du chantier.
 * Une position absente ou un chantier sans coordonnees ne declenche JAMAIS d'alerte : le controle n'est pas bloquant,
 * il sert a signaler au client les saisies faites loin du chantier.
 */
export function assessLocation(project: SiteLocation, latitude?: number | null, longitude?: number | null): LocationAssessment {
  if (latitude == null || longitude == null) {
    return { latitude: null, longitude: null, distanceMeters: null, isOffSite: false };
  }
  if (project.siteLatitude == null || project.siteLongitude == null) {
    return { latitude, longitude, distanceMeters: null, isOffSite: false };
  }
  const distance = distanceMeters(Number(project.siteLatitude), Number(project.siteLongitude), latitude, longitude);
  return { latitude, longitude, distanceMeters: distance, isOffSite: distance > project.geoFenceMeters };
}
