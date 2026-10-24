//backend/src/common/utils/geo.util.spec.ts
import { assessLocation, distanceMeters } from './geo.util';

describe('geo.util', () => {
  // Conakry (Kaloum) -> environ 111 m par 0,001 degre de latitude
  const site = { siteLatitude: 9.5092, siteLongitude: -13.7122, geoFenceMeters: 500 };

  it('calcule une distance coherente (0,001 degre de latitude = ~111 m)', () => {
    expect(distanceMeters(9.5092, -13.7122, 9.5102, -13.7122)).toBeGreaterThan(105);
    expect(distanceMeters(9.5092, -13.7122, 9.5102, -13.7122)).toBeLessThan(117);
    expect(distanceMeters(9.5092, -13.7122, 9.5092, -13.7122)).toBe(0);
  });

  it('ne signale pas une saisie dans le rayon', () => {
    const result = assessLocation(site, 9.5102, -13.7122);
    expect(result.isOffSite).toBe(false);
    expect(result.distanceMeters).toBeGreaterThan(0);
  });

  it('signale une saisie au-dela du rayon', () => {
    const result = assessLocation(site, 9.52, -13.7122); // ~ 890 m
    expect(result.isOffSite).toBe(true);
    expect(result.distanceMeters).toBeGreaterThan(500);
  });

  it("ne signale rien si la position n'est pas partagee", () => {
    expect(assessLocation(site, undefined, undefined)).toEqual({ latitude: null, longitude: null, distanceMeters: null, isOffSite: false });
  });

  it('ne signale rien si le chantier na pas de coordonnees', () => {
    const result = assessLocation({ siteLatitude: null, siteLongitude: null, geoFenceMeters: 500 }, 9.5, -13.7);
    expect(result.isOffSite).toBe(false);
    expect(result.distanceMeters).toBeNull();
    expect(result.latitude).toBe(9.5);
  });
});
