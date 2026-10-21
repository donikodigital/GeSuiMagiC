//backend/src/common/utils/project-status.util.ts
import { ProjectStatus } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';

/** Statuts de projet qui n'acceptent plus de NOUVEAU depot ni de NOUVELLE depense. */
const CLOSED_FOR_NEW_OPERATIONS: ReadonlySet<ProjectStatus> = new Set<ProjectStatus>(['SUSPENDED', 'COMPLETED', 'ARCHIVED']);

export function acceptsNewFinancialOperations(status: ProjectStatus): boolean {
  return !CLOSED_FOR_NEW_OPERATIONS.has(status);
}

/** Leve PROJECT_NOT_ACTIVE si le projet est suspendu, termine ou archive. */
export function assertProjectAcceptsFinancialOperations(status: ProjectStatus): void {
  if (!acceptsNewFinancialOperations(status)) throw AppException.projectNotActive(status);
}
