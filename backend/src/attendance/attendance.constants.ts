//backend/src/attendance/attendance.constants.ts
import { TxClient } from '../prisma/prisma.service';

/** Un superviseur peut saisir ou corriger un jour jusqu'a N jours en arriere ; au-dela, seul le superadmin. */
export const WORKDAY_EDIT_WINDOW_DAYS = 14;

/** Effectif maximal plausible sur un chantier (garde-fou contre une faute de frappe). */
export const MAX_WORKERS_PER_DAY = 1000;

/** Etapes proposees a la creation d'un projet (modifiables ensuite). */
export const DEFAULT_PHASE_NAMES = ['Fondation', 'Murs', 'Toiture', 'Électricité et plomberie', 'Carrelage', 'Finitions'] as const;

/** Cree les etapes par defaut d'un projet (a appeler dans la transaction qui cree le projet). */
export async function createDefaultPhases(tx: TxClient, projectId: string): Promise<void> {
  await tx.projectPhase.createMany({
    data: DEFAULT_PHASE_NAMES.map((name, index) => ({ projectId, name, position: index })),
  });
}
