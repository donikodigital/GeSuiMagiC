//backend/src/common/utils/project-status.util.spec.ts
import { acceptsNewFinancialOperations, assertProjectAcceptsFinancialOperations } from './project-status.util';

describe('project-status.util', () => {
  it.each(['DRAFT', 'PLANNED', 'ACTIVE'] as const)('%s accepte les operations financieres', (status) => {
    // Seuls SUSPENDED / COMPLETED / ARCHIVED sont fermes.
    expect(acceptsNewFinancialOperations(status)).toBe(true);
    expect(() => assertProjectAcceptsFinancialOperations(status)).not.toThrow();
  });

  it.each(['SUSPENDED', 'COMPLETED', 'ARCHIVED'] as const)('%s refuse avec PROJECT_NOT_ACTIVE (409)', (status) => {
    expect(acceptsNewFinancialOperations(status)).toBe(false);
    try {
      assertProjectAcceptsFinancialOperations(status);
      throw new Error('aurait du lever');
    } catch (err: any) {
      expect(err.code).toBe('PROJECT_NOT_ACTIVE');
      expect(err.getStatus()).toBe(409);
    }
  });
});
