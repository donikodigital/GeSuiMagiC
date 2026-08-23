import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Wrapper Prisma unique pour toute l'application.
 * Fournit egalement `runInTransaction` comme helper explicite pour les
 * operations financieres qui DOIVENT etre atomiques (voir section 50 du
 * cahier des charges : depot/depense -> verification -> ecriture -> audit).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connexion Prisma etablie.');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Toute ecriture financiere multi-etapes doit passer par ici pour garantir
   * l'atomicite (regle 50) et eviter les conditions de concurrence (regle
   * testee en section 72, cas 5 : deux depenses simultanees).
   * Le niveau Serializable evite qu'une lecture de solde soit perimee au
   * moment de l'ecriture concurrente.
   */
  async runInTransaction<T>(fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T> {
    return this.$transaction(fn, {
      isolationLevel: 'Serializable',
      maxWait: 5000,
      timeout: 15000,
    });
  }
}
