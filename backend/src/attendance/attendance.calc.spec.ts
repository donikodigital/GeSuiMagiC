//backend/src/attendance/attendance.calc.spec.ts
import { computeStats, monthAttendance, summarizeByMonth, summarizeByPhase, WorkDayRow } from './attendance.calc';

const day = (iso: string, isWorked: boolean, workersCount = 0, phaseId: string | null = null): WorkDayRow => ({
  date: new Date(`${iso}T00:00:00Z`),
  isWorked,
  workersCount,
  phaseId,
});

describe('attendance.calc', () => {
  const rows = [
    day('2026-10-01', true, 8, 'p-fond'),
    day('2026-10-02', true, 10, 'p-fond'),
    day('2026-10-03', false),
    day('2026-10-05', true, 6, 'p-murs'),
    day('2026-11-02', true, 5, 'p-murs'),
  ];

  it('compte jours travailles, non travailles, renseignes et jours-ouvriers', () => {
    expect(computeStats(rows)).toEqual({ workedDays: 4, notWorkedDays: 1, recordedDays: 5, workerDays: 29 });
    expect(computeStats([])).toEqual({ workedDays: 0, notWorkedDays: 0, recordedDays: 0, workerDays: 0 });
  });

  it("cas du client : 5 jours travailles sur 30 jours ecoules", () => {
    const sept = ['01', '03', '05', '07', '09'].map((d) => day(`2026-09-${d}`, true, 4, 'p'));
    const stats = monthAttendance(sept, '2026-09', new Date('2026-10-21T00:00:00Z'));
    expect(stats).toMatchObject({ daysInMonth: 30, elapsedDays: 30, workedDays: 5, workerDays: 20, recordedDays: 5, unrecordedDays: 25, attendanceRate: 16.7 });
  });

  it('mois en cours : seuls les jours ecoules comptent (aujourd\'hui inclus)', () => {
    const october = rows.filter((row) => row.date.getUTCMonth() === 9);
    const stats = monthAttendance(october, '2026-10', new Date('2026-10-05T00:00:00Z'));
    expect(stats.elapsedDays).toBe(5);
    expect(stats.recordedDays).toBe(4);
    expect(stats.unrecordedDays).toBe(1); // le 4 octobre n'a pas ete renseigne
    expect(stats.attendanceRate).toBe(60); // 3 jours travailles / 5 jours ecoules
  });

  it('mois futur : aucun jour ecoule, taux nul', () => {
    const stats = monthAttendance([], '2027-01', new Date('2026-10-21T00:00:00Z'));
    expect(stats).toMatchObject({ elapsedDays: 0, unrecordedDays: 0, attendanceRate: 0, daysInMonth: 31 });
  });

  it('totaux par etape, avec les etapes sans activite', () => {
    const phases = [
      { id: 'p-fond', name: 'Fondation', isActive: true },
      { id: 'p-murs', name: 'Murs', isActive: true },
      { id: 'p-toit', name: 'Toiture', isActive: true },
    ];
    const result = summarizeByPhase(rows, phases);
    expect(result[0]).toMatchObject({ name: 'Fondation', workedDays: 2, workerDays: 18, firstDate: '2026-10-01', lastDate: '2026-10-02' });
    expect(result[1]).toMatchObject({ name: 'Murs', workedDays: 2, workerDays: 11, firstDate: '2026-10-05', lastDate: '2026-11-02' });
    expect(result[2]).toMatchObject({ name: 'Toiture', workedDays: 0, workerDays: 0, firstDate: null, lastDate: null });
  });

  it("un jour non travaille n'est jamais compte dans une etape", () => {
    const result = summarizeByPhase([day('2026-10-03', false, 0, 'p-fond')], [{ id: 'p-fond', name: 'Fondation', isActive: true }]);
    expect(result[0].workedDays).toBe(0);
  });

  it('totaux par mois, tries', () => {
    const result = summarizeByMonth([...rows].reverse());
    expect(result.map((m) => m.month)).toEqual(['2026-10', '2026-11']);
    expect(result[0]).toMatchObject({ workedDays: 3, notWorkedDays: 1, workerDays: 24 });
    expect(result[1]).toMatchObject({ workedDays: 1, workerDays: 5 });
  });
});
