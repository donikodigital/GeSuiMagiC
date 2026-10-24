//backend/src/cron/cron.controller.ts
import { Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Public } from '../common/decorators/public.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { CronService } from './cron.service';

/**
 * Point d'entree des taches quotidiennes. Public (pas de session) mais protege par un secret :
 * Vercel Cron envoie « Authorization: Bearer <CRON_SECRET> ». Sans CRON_SECRET configure, l'endpoint est ferme.
 */
@Controller('cron')
export class CronController {
  constructor(
    private readonly cron: CronService,
    private readonly config: ConfigService,
  ) {}

  private assertAuthorized(header?: string): void {
    const secret = this.config.get<string>('cron.secret');
    const expected = Buffer.from(secret ? `Bearer ${secret}` : '');
    const given = Buffer.from(header ?? '');
    const ok = !!secret && expected.length === given.length && timingSafeEqual(expected, given);
    if (!ok) throw AppException.forbidden('CRON_FORBIDDEN', 'Accès refusé.');
  }

  @Public()
  @Get('daily')
  async dailyGet(@Headers('authorization') authorization?: string) {
    this.assertAuthorized(authorization);
    return this.cron.runDaily();
  }

  @Public()
  @Post('daily')
  @HttpCode(200)
  async dailyPost(@Headers('authorization') authorization?: string) {
    this.assertAuthorized(authorization);
    return this.cron.runDaily();
  }
}
