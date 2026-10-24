//backend/src/documents/documents.calc.spec.ts
import { alertLevelToSend, daysUntil, documentStatus } from './documents.calc';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const today = d('2026-10-21');

describe('documents.calc', () => {
  it('calcule les jours restants', () => {
    expect(daysUntil(d('2026-10-31'), today)).toBe(10);
    expect(daysUntil(d('2026-10-20'), today)).toBe(-1);
    expect(daysUntil(null, today)).toBeNull();
  });

  it('determine le statut', () => {
    expect(documentStatus(null, today)).toBe('NO_EXPIRY');
    expect(documentStatus(d('2027-03-01'), today)).toBe('VALID');
    expect(documentStatus(d('2026-12-01'), today)).toBe('EXPIRING');
    expect(documentStatus(d('2026-10-20'), today)).toBe('EXPIRED');
    expect(documentStatus(d('2026-10-21'), today)).toBe('EXPIRING');
  });

  it('ne declenche pas d alerte loin de l echeance', () => {
    expect(alertLevelToSend(d('2027-03-01'), today, null)).toBeNull();
    expect(alertLevelToSend(null, today, null)).toBeNull();
  });

  it('declenche l alerte du seuil franchi, une seule fois', () => {
    expect(alertLevelToSend(d('2026-12-10'), today, null)).toBe(60);
    expect(alertLevelToSend(d('2026-12-10'), today, 60)).toBeNull();
    expect(alertLevelToSend(d('2026-11-10'), today, 60)).toBe(30);
  });

  it('saute les seuils intermediaires si le cron a manque des jours', () => {
    expect(alertLevelToSend(d('2026-10-25'), today, 60)).toBe(7);
  });

  it('alerte a l expiration puis ne rejoue pas', () => {
    expect(alertLevelToSend(d('2026-10-15'), today, 7)).toBe(0);
    expect(alertLevelToSend(d('2026-10-15'), today, 0)).toBeNull();
  });
});
