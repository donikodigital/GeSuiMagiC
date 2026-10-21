//backend/src/common/exceptions/app.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception metier standardisee. Toujours preferer AppException.xxx() aux
 * exceptions Nest generiques pour que le frontend recoive un `code` stable
 * et exploitable (ex: bascule d'UI sur "PROJECT_NOT_ACTIVE").
 *
 * NB : un solde negatif est une regle metier ASSUMEE (jamais de blocage sur
 * solde insuffisant, voir wallets.service.spec.ts) ; l'ancienne fabrique
 * insufficientBalance() n'etait appelee nulle part et a ete retiree.
 */
export class AppException extends HttpException {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: HttpStatus, code: string, message: string, details?: unknown) {
    super(message, status);
    this.code = code;
    this.details = details;
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

  /** Le projet n'est pas dans un etat qui autorise les operations financieres. */
  static projectNotActive(status: string) {
    return new AppException(
      HttpStatus.CONFLICT,
      'PROJECT_NOT_ACTIVE',
      `Ce projet est au statut "${status}" : les depots et depenses ne sont plus acceptes. Reactivez le projet pour continuer.`,
    );
  }

  static forbidden(code: string, message: string) {
    return new AppException(HttpStatus.FORBIDDEN, code, message);
  }

  static conflict(code: string, message: string) {
    return new AppException(HttpStatus.CONFLICT, code, message);
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new AppException(HttpStatus.BAD_REQUEST, code, message, details);
  }
}
