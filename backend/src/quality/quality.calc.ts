//backend/src/quality/quality.calc.ts
import { SnagSeverity, SnagStatus } from '@prisma/client';

export interface SnagLite {
  status: SnagStatus;
  severity: SnagSeverity;
  dueDate: Date | null;
}

export interface SnagSummary {
  open: number;
  fixed: number;
  closed: number;
  /** Reserves non closes dont la date limite est depassee. */
  overdue: number;
  /** Reserves critiques non closes. */
  criticalOpen: number;
}

/** « Ouvert » au sens de la reception = OPEN ou FIXED (la levee n'est pas encore confirmee). */
export const isUnresolved = (status: SnagStatus): boolean => status !== 'CLOSED';

export function summarizeSnags(snags: SnagLite[], today: Date): SnagSummary {
  const summary: SnagSummary = { open: 0, fixed: 0, closed: 0, overdue: 0, criticalOpen: 0 };
  for (const snag of snags) {
    if (snag.status === 'OPEN') summary.open += 1;
    else if (snag.status === 'FIXED') summary.fixed += 1;
    else summary.closed += 1;
    if (isUnresolved(snag.status)) {
      if (snag.dueDate && snag.dueDate.getTime() < today.getTime()) summary.overdue += 1;
      if (snag.severity === 'CRITICAL') summary.criticalOpen += 1;
    }
  }
  return summary;
}

export type SnagRule = 'FIELD' | 'DECISION';

/**
 * Transitions autorisees d'une reserve et qui peut les faire :
 *  - OPEN -> FIXED : l'equipe terrain declare la reserve levee ;
 *  - OPEN/FIXED -> CLOSED : le client / l'architecte / le conducteur de travaux confirme ;
 *  - FIXED/CLOSED -> OPEN : refus de la levee ou reouverture (motif obligatoire).
 */
export function snagTransition(from: SnagStatus, to: SnagStatus): { allowed: boolean; rule: SnagRule | null; noteRequired: boolean } {
  if (from === 'OPEN' && to === 'FIXED') return { allowed: true, rule: 'FIELD', noteRequired: false };
  if ((from === 'OPEN' || from === 'FIXED') && to === 'CLOSED') return { allowed: true, rule: 'DECISION', noteRequired: false };
  if ((from === 'FIXED' || from === 'CLOSED') && to === 'OPEN') return { allowed: true, rule: 'DECISION', noteRequired: true };
  return { allowed: false, rule: null, noteRequired: false };
}
