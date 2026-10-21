//backend/src/auth/auth.service.spec.ts
import * as argon2 from 'argon2';
import { addMinutes } from 'date-fns';
import { AuthService } from './auth.service';
import { clearAuthCaches } from './auth-cache';
import { hashToken } from './token.util';

describe('AuthService', () => {
  let prisma: any;
  let jwt: { signAsync: jest.Mock };
  let audit: { log: jest.Mock };
  let notifications: { send: jest.Mock };
  let service: AuthService;
  let counter: number;

  const meta = { ipAddress: '1.2.3.4', userAgent: 'jest' };

  const baseAccount = (overrides: Record<string, unknown> = {}) => ({
    id: 'u-1',
    email: 'awa@example.com',
    role: 'CLIENT',
    status: 'ACTIVE',
    clientProfile: { id: 'c-1', isActive: true },
    supervisorProfile: null,
    ...overrides,
  });

  beforeEach(() => {
    clearAuthCaches();
    counter = 0;
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      clientProfile: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Awa' }) },
      supervisorProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    jwt = { signAsync: jest.fn(async (_payload: unknown, opts: { secret: string }) => `${opts.secret}.${++counter}`) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = { send: jest.fn().mockResolvedValue(undefined) };
    const settings: Record<string, unknown> = {
      'jwt.accessSecret': 'access',
      'jwt.refreshSecret': 'refresh',
      'jwt.accessExpiresIn': '15m',
      'jwt.refreshExpiresIn': '30d',
      frontendUrl: 'https://app.example',
    };
    service = new AuthService(prisma, jwt as any, { get: (key: string) => settings[key] } as any, audit as any, notifications as any);
  });

  // -------------------------------------------------------------------
  describe('login', () => {
    it('normalise l\'email (minuscules, sans espaces) et emet une paire de jetons', async () => {
      const passwordHash = await argon2.hash('Secret123');
      prisma.user.findUnique.mockResolvedValue({ ...baseAccount(), passwordHash });

      const result = await service.login('  Awa@Example.COM ', 'Secret123', meta);

      expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({ email: 'awa@example.com' });
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toEqual({ id: 'u-1', email: 'awa@example.com', role: 'CLIENT' });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN', ipAddress: '1.2.3.4' }));
    });

    it('stocke un HASH argon2 du refresh token, jamais le jeton en clair', async () => {
      const passwordHash = await argon2.hash('Secret123');
      prisma.user.findUnique.mockResolvedValue({ ...baseAccount(), passwordHash });

      const result = await service.login('awa@example.com', 'Secret123', meta);

      const stored = prisma.user.update.mock.calls.map((c: any) => c[0].data.refreshTokenHash).find(Boolean);
      expect(stored).toMatch(/^\$argon2/);
      expect(stored).not.toContain(result.refreshToken);
    });

    it('signe des jetons uniques (jwtid) pour que la rotation soit effective', async () => {
      const passwordHash = await argon2.hash('Secret123');
      prisma.user.findUnique.mockResolvedValue({ ...baseAccount(), passwordHash });

      await service.login('awa@example.com', 'Secret123', meta);

      for (const call of jwt.signAsync.mock.calls) expect(call[1].jwtid).toEqual(expect.any(String));
    });

    it('refuse un email inconnu et un mauvais mot de passe avec la MEME erreur (anti-enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login('inconnu@example.com', 'x', meta)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

      prisma.user.findUnique.mockResolvedValue({ ...baseAccount(), passwordHash: await argon2.hash('Secret123') });
      await expect(service.login('awa@example.com', 'Mauvais1', meta)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('un compte sans mot de passe (invitation non acceptee) ne peut pas se connecter', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseAccount({ status: 'INVITED' }), passwordHash: null });

      await expect(service.login('awa@example.com', 'x', meta)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it.each([
      ['compte SUSPENDED', { status: 'SUSPENDED' }],
      ['compte DISABLED', { status: 'DISABLED' }],
      ['client suspendu', { clientProfile: { id: 'c-1', isActive: false } }],
      ['superviseur d\'un client suspendu', { role: 'SUPERVISOR', clientProfile: null, supervisorProfile: { id: 's-1', clientId: 'c-1', client: { isActive: false } } }],
    ])('refuse un %s meme avec le bon mot de passe', async (_label, overrides) => {
      prisma.user.findUnique.mockResolvedValue({ ...baseAccount(overrides), passwordHash: await argon2.hash('Secret123') });

      await expect(service.login('awa@example.com', 'Secret123', meta)).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  describe('refresh', () => {
    const REFRESH = 'refresh-token-1';

    async function accountWithRefresh(overrides: Record<string, unknown> = {}) {
      return { ...baseAccount(overrides), refreshTokenHash: await argon2.hash(REFRESH) };
    }

    it('fait tourner la paire de jetons (compare-and-swap sur l\'ancien hash)', async () => {
      const account = await accountWithRefresh();
      prisma.user.findUnique.mockResolvedValue(account);

      const pair = await service.refresh('u-1', REFRESH);

      expect(pair.refreshToken).not.toBe(REFRESH);
      const swap = prisma.user.updateMany.mock.calls[0][0];
      expect(swap.where).toEqual({ id: 'u-1', refreshTokenHash: account.refreshTokenHash });
      expect(swap.data.refreshTokenHash).toMatch(/^\$argon2/);
    });

    it('le MEME jeton presente deux fois de suite (double clic, 2 onglets) renvoie la meme paire sans deconnecter', async () => {
      prisma.user.findUnique.mockResolvedValue(await accountWithRefresh());

      const first = await service.refresh('u-1', REFRESH);
      const second = await service.refresh('u-1', REFRESH);

      expect(second).toEqual(first);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    });

    it('deux rafraichissements simultanes ne produisent qu\'une seule rotation', async () => {
      prisma.user.findUnique.mockResolvedValue(await accountWithRefresh());

      const [a, b] = await Promise.all([service.refresh('u-1', REFRESH), service.refresh('u-1', REFRESH)]);

      expect(a).toEqual(b);
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    });

    it('un jeton incorrect revoque la session par precaution (vol presume)', async () => {
      prisma.user.findUnique.mockResolvedValue(await accountWithRefresh());

      await expect(service.refresh('u-1', 'jeton-vole')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-1' }, data: { refreshTokenHash: null } });
    });

    it('refuse sans session ouverte (aucun hash stocke) ou avec un jeton vide', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseAccount(), refreshTokenHash: null });
      await expect(service.refresh('u-1', REFRESH)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      await expect(service.refresh('u-1', '')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('un compte suspendu ne peut plus renouveler sa session, et sa session est revoquee', async () => {
      prisma.user.findUnique.mockResolvedValue(await accountWithRefresh({ status: 'SUSPENDED' }));

      await expect(service.refresh('u-1', REFRESH)).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-1' }, data: { refreshTokenHash: null } });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('si une autre instance a deja fait tourner le jeton (0 ligne modifiee), la requete est refusee', async () => {
      prisma.user.findUnique.mockResolvedValue(await accountWithRefresh());
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh('u-1', REFRESH)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });
  });

  // -------------------------------------------------------------------
  describe('acceptInvitation', () => {
    const invited = (overrides: Record<string, unknown> = {}) => ({
      id: 'u-1',
      role: 'CLIENT',
      status: 'INVITED',
      invitationTokenHash: hashToken('raw-token'),
      invitationTokenExpiresAt: new Date(Date.now() + 3_600_000),
      ...overrides,
    });

    it('active le compte et consomme le lien de facon conditionnelle (usage unique)', async () => {
      prisma.user.findFirst.mockResolvedValue(invited());

      await expect(service.acceptInvitation('raw-token', 'Motdepasse1', meta)).resolves.toEqual({ activated: true });

      const call = prisma.user.updateMany.mock.calls[0][0];
      expect(call.where).toMatchObject({ id: 'u-1', invitationTokenHash: hashToken('raw-token'), status: 'INVITED' });
      expect(call.data).toMatchObject({ status: 'ACTIVE', invitationTokenHash: null, invitationTokenExpiresAt: null });
      expect(call.data.passwordHash).toMatch(/^\$argon2/);
    });

    it('cherche par HASH du jeton (le jeton en clair n\'est jamais compare en base)', async () => {
      prisma.user.findFirst.mockResolvedValue(invited());

      await service.acceptInvitation('raw-token', 'Motdepasse1', meta);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { invitationTokenHash: hashToken('raw-token') } });
    });

    it.each([
      ['jeton inconnu', null],
      ['lien expire', invited({ invitationTokenExpiresAt: new Date(Date.now() - 1_000) })],
      ['compte deja actif', invited({ status: 'ACTIVE' })],
      ['compte suspendu (un vieux lien ne le reactive pas)', invited({ status: 'SUSPENDED' })],
    ])('refuse : %s', async (_label, user) => {
      prisma.user.findFirst.mockResolvedValue(user);

      await expect(service.acceptInvitation('raw-token', 'Motdepasse1', meta)).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_TOKEN' });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('deux utilisations simultanees du meme lien : la seconde est refusee', async () => {
      prisma.user.findFirst.mockResolvedValue(invited());
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.acceptInvitation('raw-token', 'Motdepasse1', meta)).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_TOKEN' });
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  describe('forgotPassword', () => {
    const active = (overrides: Record<string, unknown> = {}) => ({ id: 'u-1', status: 'ACTIVE', resetTokenExpiresAt: null, ...overrides });

    it('repond sans rien reveler (et sans envoyer) pour un email inconnu ou un compte non actif', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.forgotPassword('x@example.com')).resolves.toBeUndefined();

      prisma.user.findUnique.mockResolvedValue(active({ status: 'SUSPENDED' }));
      await expect(service.forgotPassword('x@example.com')).resolves.toBeUndefined();

      expect(notifications.send).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('stocke le HASH du jeton et envoie le jeton en clair uniquement dans le lien du mail', async () => {
      prisma.user.findUnique.mockResolvedValue(active());

      await service.forgotPassword('awa@example.com');

      const stored = prisma.user.update.mock.calls[0][0].data;
      const html: string = notifications.send.mock.calls[0][0].emailHtml;
      const raw = html.match(/reset-password\?token=([0-9a-f]{64})/)?.[1];
      expect(raw).toBeDefined();
      expect(stored.resetTokenHash).toBe(hashToken(raw!));
      expect(stored.resetTokenHash).not.toBe(raw);
      expect(notifications.send.mock.calls[0][0].type).toBe('PASSWORD_RESET');
    });

    it('limite l\'envoi : pas de second email dans les 2 minutes', async () => {
      // Un lien vient d'etre emis : son expiration est dans ~2 h (validite de 2 h).
      prisma.user.findUnique.mockResolvedValue(active({ resetTokenExpiresAt: addMinutes(new Date(), 119) }));

      await service.forgotPassword('awa@example.com');

      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('renvoie un lien si le precedent date de plus de 2 minutes', async () => {
      prisma.user.findUnique.mockResolvedValue(active({ resetTokenExpiresAt: addMinutes(new Date(), 100) }));

      await service.forgotPassword('awa@example.com');

      expect(notifications.send).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------
  describe('resetPassword', () => {
    const resettable = (overrides: Record<string, unknown> = {}) => ({
      id: 'u-1',
      role: 'CLIENT',
      status: 'ACTIVE',
      resetTokenHash: hashToken('reset-raw'),
      resetTokenExpiresAt: new Date(Date.now() + 3_600_000),
      ...overrides,
    });

    it('change le mot de passe, consomme le lien (usage unique) et revoque les sessions', async () => {
      prisma.user.findFirst.mockResolvedValue(resettable());

      await service.resetPassword('reset-raw', 'Nouveau123', meta);

      const call = prisma.user.updateMany.mock.calls[0][0];
      expect(call.where).toMatchObject({ id: 'u-1', resetTokenHash: hashToken('reset-raw'), status: 'ACTIVE' });
      expect(call.data).toMatchObject({ resetTokenHash: null, resetTokenExpiresAt: null, refreshTokenHash: null });
      expect(call.data.passwordHash).toMatch(/^\$argon2/);
    });

    it.each([
      ['jeton inconnu', null],
      ['lien expire', resettable({ resetTokenExpiresAt: new Date(Date.now() - 1_000) })],
      ['compte suspendu depuis la demande', resettable({ status: 'SUSPENDED' })],
    ])('refuse : %s', async (_label, user) => {
      prisma.user.findFirst.mockResolvedValue(user);

      await expect(service.resetPassword('reset-raw', 'Nouveau123', meta)).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_TOKEN' });
    });

    it('deux utilisations simultanees du meme lien : la seconde est refusee', async () => {
      prisma.user.findFirst.mockResolvedValue(resettable());
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.resetPassword('reset-raw', 'Nouveau123', meta)).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_TOKEN' });
    });
  });

  // -------------------------------------------------------------------
  describe('changePassword', () => {
    it('verifie le mot de passe actuel, revoque les sessions et les liens de reinitialisation', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u-1', role: 'CLIENT', passwordHash: await argon2.hash('Ancien123') });

      await service.changePassword('u-1', 'Ancien123', 'Nouveau123', meta);

      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ refreshTokenHash: null, resetTokenHash: null, resetTokenExpiresAt: null });
      expect(data.passwordHash).toMatch(/^\$argon2/);
    });

    it('refuse un mauvais mot de passe actuel', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u-1', role: 'CLIENT', passwordHash: await argon2.hash('Ancien123') });

      await expect(service.changePassword('u-1', 'Faux12345', 'Nouveau123', meta)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('supprime le hash du refresh token', async () => {
      await service.logout('u-1', meta);

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-1' }, data: { refreshTokenHash: null } });
    });
  });
});
