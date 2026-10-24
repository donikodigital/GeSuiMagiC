//backend/src/purchasing/purchasing.service.spec.ts
import { Prisma } from '@prisma/client';
import { PurchasingService } from './purchasing.service';

const D = (n: number | string) => new Prisma.Decimal(n);

describe('PurchasingService - livraisons', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let notifier: { toClient: jest.Mock };
  let service: PurchasingService;

  const PROJECT = 'p-1';
  const supervisor = { userId: 'u-s', email: 's@x', role: 'SUPERVISOR' as const, supervisorProfileId: 's-1' };
  const today = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ id: PROJECT, name: 'Villa', clientId: 'c-1', status: 'ACTIVE', currency: 'GNF', siteLatitude: null, siteLongitude: null, geoFenceMeters: 500 }),
      },
      projectSupervisor: { findFirst: jest.fn().mockResolvedValue({ position: 'SUPERVISOR' }) },
      delivery: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'd-1' }) },
      deliveryLine: { create: jest.fn().mockResolvedValue({ id: 'dl-1' }) },
      purchaseOrder: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      purchaseOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
      stockItem: { findFirst: jest.fn().mockResolvedValue({ id: 'i-1' }), create: jest.fn().mockResolvedValue({ id: 'i-new' }) },
      stockMovement: { create: jest.fn().mockResolvedValue({ id: 'm-1' }) },
    };
    prisma.runInTransaction = jest.fn().mockImplementation((fn: any) => fn(prisma));
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notifier = { toClient: jest.fn() };
    service = new PurchasingService(prisma, audit as any, { listForEntities: jest.fn().mockResolvedValue(new Map()) } as any, notifier as any);
    jest.spyOn(service, 'findDelivery').mockResolvedValue({ id: 'd-1' } as any);
  });

  it('une livraison cree une entree de stock de la quantite acceptee', async () => {
    await service.createDelivery(PROJECT, { date: today, lines: [{ label: 'Ciment', unit: 'sac', quantityReceived: 100, quantityRefused: 8 }] }, supervisor);

    expect(prisma.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'IN', quantity: D(92), stockItemId: 'i-1' }) });
    expect(notifier.toClient).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'DELIVERY_RECEIVED' }));
  });

  it('cree automatiquement un article inconnu', async () => {
    prisma.stockItem.findFirst.mockResolvedValue(null);

    await service.createDelivery(PROJECT, { date: today, lines: [{ label: ' Fer  8 ', unit: 'barre', quantityReceived: 10 }] }, supervisor);

    expect(prisma.stockItem.create).toHaveBeenCalledWith({ data: { projectId: PROJECT, name: 'Fer 8', unit: 'barre' } });
  });

  it('refuse une quantite refusee superieure a la quantite recue', async () => {
    await expect(
      service.createDelivery(PROJECT, { date: today, lines: [{ label: 'Ciment', unit: 'sac', quantityReceived: 5, quantityRefused: 6 }] }, supervisor),
    ).rejects.toMatchObject({ code: 'REFUSED_EXCEEDS_RECEIVED' });
  });

  it("n'entre rien en stock quand tout est refuse", async () => {
    await service.createDelivery(PROJECT, { date: today, lines: [{ label: 'Ciment', unit: 'sac', quantityReceived: 5, quantityRefused: 5 }] }, supervisor);

    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it('passe la commande a « partielle » puis « livree »', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'o-1', number: 4, status: 'ORDERED', supplierName: null, supplierId: null, lines: [{ id: 'ol-1', label: 'Ciment', unit: 'sac' }] });
    prisma.purchaseOrderLine.findMany.mockResolvedValue([{ id: 'ol-1', quantityOrdered: D(100), deliveryLines: [{ quantityReceived: D(60), quantityRefused: D(0) }] }]);

    await service.createDelivery(PROJECT, { orderId: 'o-1', date: today, lines: [{ orderLineId: 'ol-1', quantityReceived: 60 }] }, supervisor);
    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith({ where: { id: 'o-1' }, data: { status: 'PARTIAL' } });

    prisma.purchaseOrderLine.findMany.mockResolvedValue([{ id: 'ol-1', quantityOrdered: D(100), deliveryLines: [{ quantityReceived: D(60), quantityRefused: D(0) }, { quantityReceived: D(40), quantityRefused: D(0) }] }]);
    await service.createDelivery(PROJECT, { orderId: 'o-1', date: today, lines: [{ orderLineId: 'ol-1', quantityReceived: 40 }] }, supervisor);
    expect(prisma.purchaseOrder.update).toHaveBeenLastCalledWith({ where: { id: 'o-1' }, data: { status: 'DELIVERED' } });
  });

  it('refuse une livraison sur une commande annulee', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'o-1', number: 4, status: 'CANCELLED', lines: [] });

    await expect(service.createDelivery(PROJECT, { orderId: 'o-1', date: today, lines: [{ label: 'x', unit: 'u', quantityReceived: 1 }] }, supervisor)).rejects.toMatchObject({ code: 'ORDER_CANCELLED' });
  });

  it('ne rejoue pas une livraison deja recue hors ligne (clientRef)', async () => {
    prisma.delivery.findFirst.mockResolvedValue({ id: 'd-old' });

    await service.createDelivery(PROJECT, { clientRef: 'offline-12345', lines: [{ label: 'Ciment', unit: 'sac', quantityReceived: 5 }] }, supervisor);

    expect(prisma.delivery.create).not.toHaveBeenCalled();
  });

  it("signale une livraison saisie hors du perimetre du chantier", async () => {
    prisma.project.findUnique.mockResolvedValue({ id: PROJECT, name: 'Villa', clientId: 'c-1', status: 'ACTIVE', currency: 'GNF', siteLatitude: D('9.5370'), siteLongitude: D('-13.6785'), geoFenceMeters: 500 });

    await service.createDelivery(PROJECT, { date: today, latitude: 9.7, longitude: -13.5, lines: [{ label: 'Ciment', unit: 'sac', quantityReceived: 5 }] }, supervisor);

    expect(prisma.delivery.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isOffSite: true }) });
    expect(notifier.toClient).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'LOCATION_ALERT' }));
  });
});
