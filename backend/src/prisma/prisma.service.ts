//backend/src/prisma/prisma.service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Client transactionnel passe aux callbacks de runInTransaction. */
export type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/** Nombre maximal de tentatives d'une transaction en cas de conflit de serialisation. */
const MAX_TX_ATTEMPTS = 3;

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
   *
   * Avec Serializable, Postgres annule l'une des deux transactions en conflit
   * (erreur P2034). Avant, cette erreur remontait telle quelle en 500 : on
   * rejoue maintenant la transaction (jusqu'a MAX_TX_ATTEMPTS fois, avec un
   * court delai aleatoire). Le callback doit donc ne contenir QUE des
   * operations en base (pas d'email, pas d'appel reseau) : il peut etre rejoue.
   */
  async runInTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.$transaction(fn, {
          isolationLevel: 'Serializable',
          maxWait: 5000,
          timeout: 15000,
        });
      } catch (error) {
        if (attempt < MAX_TX_ATTEMPTS && isSerializationConflict(error)) {
          this.logger.warn(`Conflit de transaction (P2034), nouvelle tentative ${attempt + 1}/${MAX_TX_ATTEMPTS}.`);
          await sleep(30 * attempt + Math.floor(Math.random() * 40));
          continue;
        }
        throw error;
      }
    }
  }
}
