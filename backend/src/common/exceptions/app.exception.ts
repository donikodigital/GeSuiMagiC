import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception metier standardisee. Toujours preferer AppException.xxx() aux
 * exceptions Nest generiques pour que le frontend recoive un `code` stable
 * et exploitable (ex: bascule d'UI sur "INSUFFICIENT_BALANCE").
 */
export class AppException extends HttpException {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: HttpStatus, code: string, message: string, details?: unknown) {
    super(message, status);
    this.code = code;
    this.details = details;
  }

  static insufficientBalance(available: string, requested: string) {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'INSUFFICIENT_BALANCE',
      'Le solde disponible est insuffisant pour cette operation.',
      { available, requested },
    );
  }

  static locked(entity: string) {
    return new AppException(
      HttpStatus.CONFLICT,
      'ENTITY_LOCKED',
      `${entity} est deja validee et verrouillee. Une correction administrative est requise pour la modifier.`,
    );
  }

  static forbiddenProjectAccess() {
    return new AppException(
      HttpStatus.FORBIDDEN,
      'PROJECT_ACCESS_DENIED',
      "Vous n'avez pas acces a ce projet.",
    );
  }

  static notFound(entity: string) {
    return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${entity} introuvable.`);
  }

  static invalidCredentials() {
    return new AppException(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Identifiants incorrects.');
  }

  static accountNotActive() {
    return new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_NOT_ACTIVE', "Ce compte n'est pas actif.");
  }

  static invalidOrExpiredToken() {
    return new AppException(HttpStatus.BAD_REQUEST, 'INVALID_OR_EXPIRED_TOKEN', 'Ce lien est invalide ou a expire.');
  }

  static conflict(code: string, message: string) {
    return new AppException(HttpStatus.CONFLICT, code, message);
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new AppException(HttpStatus.BAD_REQUEST, code, message, details);
  }
}
