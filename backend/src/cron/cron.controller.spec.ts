//backend/src/cron/cron.controller.spec.ts
import { CronController } from './cron.controller';

describe('CronController', () => {
  const run = jest.fn().mockResolvedValue({ documentAlerts: 0 });
  const build = (secret?: string) => new CronController({ runDaily: run } as any, { get: () => secret } as any);

  beforeEach(() => run.mockClear());

  it("refuse tout appel quand CRON_SECRET n'est pas configuré", async () => {
    await expect(build(undefined).dailyGet('Bearer ')).rejects.toMatchObject({ code: 'CRON_FORBIDDEN' });
    await expect(build(undefined).dailyGet(undefined)).rejects.toMatchObject({ code: 'CRON_FORBIDDEN' });
    expect(run).not.toHaveBeenCalled();
  });

  it('refuse un mauvais secret', async () => {
    await expect(build('s3cret-value-0123456789').dailyGet('Bearer autre-secret-0123456789')).rejects.toMatchObject({ code: 'CRON_FORBIDDEN' });
    expect(run).not.toHaveBeenCalled();
  });

  it('lance les taches avec le bon secret (GET et POST)', async () => {
    const controller = build('s3cret-value-0123456789');
    await controller.dailyGet('Bearer s3cret-value-0123456789');
    await controller.dailyPost('Bearer s3cret-value-0123456789');
    expect(run).toHaveBeenCalledTimes(2);
  });
});
