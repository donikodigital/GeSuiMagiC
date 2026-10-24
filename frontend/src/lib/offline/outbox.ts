//frontend/src/lib/offline/outbox.ts
// File d'attente hors ligne (IndexedDB). Une saisie faite sans reseau est conservee sur l'appareil avec ses photos,
// puis envoyee dans l'ordre au retour du reseau. Chaque saisie porte un identifiant genere par l'appareil (clientRef) :
// un envoi rejoue apres une coupure ne cree jamais de doublon cote serveur.

import { ApiError, api } from '@/lib/api-client';
import { attachmentsService, type AttachmentTarget } from '@/services/attachments.service';

export type OutboxKind =
  | 'expense'
  | 'site-log'
  | 'progress'
  | 'snag'
  | 'delivery'
  | 'stock-movement'
  | 'work-day'
  | 'worker-presences'
  | 'contract-payment'
  | 'attachment';

export interface OutboxFile {
  blob: Blob;
  name: string;
  kind: string;
  /** Instant de la prise de vue (ISO). */
  capturedAt?: string;
}

/** Comment rattacher les fichiers une fois l'objet cree. */
export type OutboxAttach =
  | { mode: 'expense' }
  | { mode: 'entity'; entityType: string }
  /** Fichiers pour un objet qui existe deja (aucune requete a rejouer). */
  | { mode: 'fixed'; target: AttachmentTarget };

export interface OutboxItem {
  id: string;
  userId: string;
  projectId: string;
  kind: OutboxKind;
  label: string;
  createdAt: number;
  request?: { method: 'POST' | 'PUT'; path: string; body: unknown };
  attach?: OutboxAttach;
  files: OutboxFile[];
  createdEntityId?: string;
  status: 'pending' | 'failed';
  attempts: number;
  lastError?: string;
}

const DB_NAME = 'gesuimagic-outbox';
const STORE = 'items';
const CHANGE_EVENT = 'outbox-changed';
/** Au-dela, une saisie en erreur serveur repetee passe en « a corriger » au lieu de boucler. */
const MAX_ATTEMPTS = 6;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponible'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    transaction.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function notifyChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onOutboxChange(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

async function put(item: OutboxItem): Promise<void> {
  await tx('readwrite', (store) => store.put(item));
  notifyChange();
}

export async function listOutbox(userId: string): Promise<OutboxItem[]> {
  try {
    const all = await tx<OutboxItem[]>('readonly', (store) => store.getAll());
    return all.filter((i) => i.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function removeOutboxItem(id: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(id));
  notifyChange();
}

/** Remet une saisie « a corriger » dans la file (apres correction du probleme ou simple nouvel essai). */
export async function retryOutboxItem(id: string): Promise<void> {
  const item = await tx<OutboxItem | undefined>('readonly', (store) => store.get(id));
  if (!item) return;
  await put({ ...item, status: 'pending', attempts: 0, lastError: undefined });
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}

export interface QueueableRequest {
  userId: string;
  projectId: string;
  kind: OutboxKind;
  label: string;
  method: 'POST' | 'PUT';
  path: string;
  body: unknown;
  files?: OutboxFile[];
  attach?: OutboxAttach;
}

export type SubmitResult<T> = { queued: false; data: T; pendingFiles: boolean } | { queued: true; item: OutboxItem };

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function targetFor(item: Pick<OutboxItem, 'projectId' | 'attach' | 'createdEntityId'>): AttachmentTarget | null {
  const attach = item.attach;
  if (!attach) return null;
  if (attach.mode === 'fixed') return attach.target;
  if (!item.createdEntityId) return null;
  return attach.mode === 'expense'
    ? { projectId: item.projectId, expenseId: item.createdEntityId }
    : { projectId: item.projectId, entityType: attach.entityType, entityId: item.createdEntityId };
}

/** Envoie les fichiers restants un par un ; renvoie l'etat de la saisie (fichiers non envoyes) et l'erreur eventuelle. */
async function uploadFiles(item: OutboxItem, persist: (next: OutboxItem) => Promise<void> | void): Promise<{ item: OutboxItem; error?: unknown }> {
  let current = item;
  try {
    while (current.files.length > 0) {
      const target = targetFor(current);
      if (!target) break;
      const [file, ...rest] = current.files;
      await attachmentsService.uploadAndRegister(file.blob, file.name, file.kind, target, file.capturedAt);
      current = { ...current, files: rest };
      await persist(current);
    }
  } catch (error) {
    return { item: current, error };
  }
  return { item: current };
}

/**
 * Envoie la saisie tout de suite si le reseau repond ; sinon (ou si le serveur est injoignable) la garde dans la file.
 * Les erreurs de validation du serveur (4xx) sont renvoyees a l'appelant : elles ne se corrigent pas toutes seules.
 */
export async function submitOrQueue<T extends { id?: string }>(input: QueueableRequest): Promise<SubmitResult<T>> {
  const base: OutboxItem = {
    id: newId(),
    userId: input.userId,
    projectId: input.projectId,
    kind: input.kind,
    label: input.label,
    createdAt: Date.now(),
    request: { method: input.method, path: input.path, body: input.body },
    attach: input.attach,
    files: input.files ?? [],
    status: 'pending',
    attempts: 0,
  };

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!offline) {
    try {
      const data = input.method === 'PUT' ? await api.put<T>(input.path, input.body) : await api.post<T>(input.path, input.body);
      const created: OutboxItem = { ...base, createdEntityId: (data as { id?: string } | undefined)?.id };
      if (created.files.length === 0) return { queued: false, data, pendingFiles: false };

      const uploaded = await uploadFiles(created, async () => undefined);
      if (!uploaded.error && uploaded.item.files.length === 0) return { queued: false, data, pendingFiles: false };
      // L'objet est cree mais des fichiers ne sont pas partis : ils sont conserves et repartiront sans rejouer la creation.
      const network = uploaded.error === undefined || isNetworkError(uploaded.error);
      await put({
        ...uploaded.item,
        request: undefined,
        status: network ? 'pending' : 'failed',
        lastError: uploaded.error instanceof Error ? uploaded.error.message : undefined,
      });
      return { queued: false, data, pendingFiles: true };
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }

  await put(base);
  return { queued: true, item: base };
}

/** Garde sur l'appareil des fichiers destines a un objet deja existant (envoyes au retour du reseau). */
export async function queueFiles(input: { userId: string; projectId: string; label: string; target: AttachmentTarget; files: OutboxFile[] }): Promise<OutboxItem> {
  const item: OutboxItem = {
    id: newId(),
    userId: input.userId,
    projectId: input.projectId,
    kind: 'attachment',
    label: input.label,
    createdAt: Date.now(),
    attach: { mode: 'fixed', target: input.target },
    files: input.files,
    status: 'pending',
    attempts: 0,
  };
  await put(item);
  return item;
}

let flushing = false;

export interface FlushResult {
  sent: number;
  failed: number;
  pending: number;
  stoppedByNetwork: boolean;
}

/** Envoie la file dans l'ordre. S'arrete au premier probleme de reseau ; une saisie refusee par le serveur passe « a corriger ». */
export async function flushOutbox(userId: string): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, pending: 0, stoppedByNetwork: false };
  if (flushing) return result;
  flushing = true;
  try {
    const items = (await listOutbox(userId)).filter((i) => i.status === 'pending');
    for (const original of items) {
      let item = original;
      try {
        if (item.request && !item.createdEntityId) {
          const data =
            item.request.method === 'PUT' ? await api.put<{ id?: string }>(item.request.path, item.request.body) : await api.post<{ id?: string }>(item.request.path, item.request.body);
          item = { ...item, createdEntityId: data?.id };
          await put(item);
        }
        const uploaded = await uploadFiles(item, put);
        item = uploaded.item;
        if (uploaded.error) throw uploaded.error;
        await removeOutboxItem(item.id);
        result.sent += 1;
      } catch (error) {
        if (isNetworkError(error)) {
          result.stoppedByNetwork = true;
          break;
        }
        const message = error instanceof Error ? error.message : 'Envoi impossible.';
        const serverSide = error instanceof ApiError && error.status >= 500;
        const attempts = item.attempts + 1;
        const giveUp = !serverSide || attempts >= MAX_ATTEMPTS;
        await put({ ...item, attempts, lastError: message, status: giveUp ? 'failed' : 'pending' });
        if (giveUp) result.failed += 1;
        else break; // erreur serveur passagere : on reessaiera plus tard, sans depasser l'ordre des saisies
      }
    }
    result.pending = (await listOutbox(userId)).filter((i) => i.status === 'pending').length;
    return result;
  } finally {
    flushing = false;
  }
}
