//backend/src/common/utils/sequence.util.ts
import { TxClient } from '../../prisma/prisma.service';

type NumberedModel = 'snag' | 'reception' | 'changeOrder' | 'quoteLot' | 'contract' | 'purchaseOrder' | 'payRun';

/**
 * Prochain numero lisible (1, 2, 3...) d'un objet numerote par projet.
 * A appeler dans la transaction qui cree l'objet : la contrainte d'unicite (projectId, number) garantit l'absence de doublon.
 */
export async function nextProjectNumber(tx: TxClient, model: NumberedModel, projectId: string): Promise<number> {
  const delegate = tx[model] as unknown as { aggregate: (args: unknown) => Promise<{ _max: { number: number | null } }> };
  const last = await delegate.aggregate({ where: { projectId }, _max: { number: true } });
  return (last._max.number ?? 0) + 1;
}
