import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from '../exceptions/app.exception';

/**
 * Normalise TOUTES les reponses d'erreur au format (section 66) :
 * { success: false, code: "INSUFFICIENT_BALANCE", message: "..." }
 *
 * Les erreurs techniques internes (stack traces, messages Prisma bruts, etc.)
 * ne sont jamais exposees au client : elles sont loguees cote serveur et
 * remplacees par un message generique.
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
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return 'ERROR';
  }
}
