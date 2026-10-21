//backend/src/common/filters/http-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { AppException } from '../exceptions/app.exception';

/**
 * Normalise TOUTES les reponses d'erreur au format (section 66) :
 * { success: false, code: "PROJECT_NOT_ACTIVE", message: "..." }
 *
 * Les erreurs techniques internes (stack traces, messages Prisma bruts, etc.)
 * ne sont jamais exposees au client : elles sont loguees cote serveur et
 * remplacees par un message generique.
 *
 * Les erreurs Prisma "previsibles" sont traduites en vrais codes HTTP au lieu
 * d'un 500 generique (id inconnu -> 404, doublon -> 409, reference invalide
 * -> 400, conflit de transaction -> 409...).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = "Une erreur interne est survenue. Merci de reessayer ou de contacter le support.";
    let details: unknown;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = Array.isArray(b.message) ? (b.message as string[]).join(' ; ') : ((b.message as string) ?? message);
        details = b.errors ?? undefined;
      }
      code = defaultCodeForStatus(status);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = mapPrismaError(exception);
      if (mapped) {
        ({ status, code, message } = mapped);
        this.logger.warn(`Erreur Prisma ${exception.code} sur ${request.method} ${request.url} -> ${status} ${code}`);
      } else {
        this.logger.error(`Erreur Prisma non geree (${exception.code}) sur ${request.method} ${request.url}`, exception.stack);
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'INVALID_DATA';
      message = 'Les donnees envoyees sont invalides.';
      this.logger.warn(`Validation Prisma sur ${request.method} ${request.url}`);
    } else {
      // Erreur non prevue : on logue le detail complet cote serveur uniquement.
      this.logger.error(`Erreur non geree sur ${request.method} ${request.url}`, exception instanceof Error ? exception.stack : String(exception));
    }

    if (status >= 500) {
      this.logger.error(`[${code}] ${request.method} ${request.url} - ${message}`);
    }

    response.status(status).json({
      success: false,
      code,
      message,
      ...(details ? { details } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

export function mapPrismaError(error: Prisma.PrismaClientKnownRequestError): { status: number; code: string; message: string } | null {
  switch (error.code) {
    case 'P2025': // enregistrement requis introuvable (findUniqueOrThrow, update/delete sur id inconnu)
      return { status: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: 'Ressource introuvable.' };
    case 'P2002': // contrainte d'unicite
      return { status: HttpStatus.CONFLICT, code: 'DUPLICATE_ENTRY', message: 'Cette valeur existe deja.' };
    case 'P2003': // cle etrangere : reference inexistante, ou element encore utilise
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_REFERENCE',
        message: 'Reference invalide : un element lie est introuvable ou encore utilise.',
      };
    case 'P2034': // conflit/serialisation de transaction (apres les tentatives automatiques)
      return {
        status: HttpStatus.CONFLICT,
        code: 'CONCURRENT_UPDATE',
        message: "Une autre operation est en cours sur ces donnees. Merci de reessayer dans un instant.",
      };
    case 'P2000': // valeur trop longue pour la colonne
    case 'P2020': // valeur hors limites (ex: montant superieur a Decimal(18,2))
      return { status: HttpStatus.BAD_REQUEST, code: 'VALUE_OUT_OF_RANGE', message: 'Une valeur saisie est trop grande ou hors limites.' };
    default:
      return null;
  }
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'PAYLOAD_TOO_LARGE';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return 'ERROR';
  }
}
