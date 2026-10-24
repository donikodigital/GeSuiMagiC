//backend/src/documents/documents.service.spec.ts
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  let prisma: any;
  let notifier: { toClient: jest.Mock; toReviewers: jest.Mock };
  let service: DocumentsService;

  const today = new Date('2026-10-21T00:00:00Z');
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'd-1', title: 'Assurance décennale', expiresAt: new Date('2026-11-10T00:00:00Z'), lastAlertDays: null, project: { id: 'p-1', name: 'Villa', clientId: 'c-1' }, ...overrides,
  });

  beforeEach(() => {
    prisma = {
      projectDocument: { findMany: jest.fn().mockResolvedValue([row()]), update: jest.fn().mockResolvedValue({}) },
    };
    notifier = { toClient: jest.fn(), toReviewers: jest.fn() };
    service = new DocumentsService(prisma, { log: jest.fn() } as any, { listForEntities: jest.fn() } as any, notifier as any);
  });

  it("alerte au seuil franchi (20 jours -> seuil de 30) et memorise le seuil", async () => {
    const sent = await service.sendExpiryAlerts(today);

    expect(sent).toBe(1);
    expect(notifier.toClient).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1' }), expect.objectContaining({ type: 'DOCUMENT_EXPIRING' }));
    expect(prisma.projectDocument.update).toHaveBeenCalledWith({ where: { id: 'd-1' }, data: { lastAlertDays: 30 } });
  });

  it('ne renvoie pas une alerte deja envoyee pour ce seuil', async () => {
    prisma.projectDocument.findMany.mockResolvedValue([row({ lastAlertDays: 30 })]);

    expect(await service.sendExpiryAlerts(today)).toBe(0);
    expect(notifier.toClient).not.toHaveBeenCalled();
  });

  it('alerte a nouveau quand un seuil plus proche est franchi', async () => {
    prisma.projectDocument.findMany.mockResolvedValue([row({ lastAlertDays: 30, expiresAt: new Date('2026-10-30T00:00:00Z') })]);

    expect(await service.sendExpiryAlerts(today)).toBe(1);
    expect(prisma.projectDocument.update).toHaveBeenCalledWith({ where: { id: 'd-1' }, data: { lastAlertDays: 14 } });
  });

  it("n'alerte pas un document encore loin de son echeance", async () => {
    prisma.projectDocument.findMany.mockResolvedValue([row({ expiresAt: new Date('2027-06-01T00:00:00Z') })]);

    expect(await service.sendExpiryAlerts(today)).toBe(0);
  });

  it('continue avec les autres documents si une notification echoue', async () => {
    prisma.projectDocument.findMany.mockResolvedValue([row({ id: 'd-1' }), row({ id: 'd-2' })]);
    notifier.toClient.mockRejectedValueOnce(new Error('boom'));

    expect(await service.sendExpiryAlerts(today)).toBe(1);
  });
});
