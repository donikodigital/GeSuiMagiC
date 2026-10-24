//frontend/src/services/attachments.service.ts
import { api, ApiError } from '@/lib/api-client';
import type { Attachment } from '@/types/models';

export interface PresignResponse {
  uploadUrl: string;
  fileUrl: string;
  key: string;
}

/** Cible d'une piece jointe : un depot, une depense, ou un autre objet du chantier (journal, reserve, livraison...). */
export interface AttachmentTarget {
  projectId?: string;
  depositId?: string;
  expenseId?: string;
  entityType?: string;
  entityId?: string;
}

export interface RegisterAttachmentPayload extends AttachmentTarget {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  kind: string;
  /** Instant de la prise de vue (ISO 8601), fourni par l'appareil. */
  capturedAt?: string;
}

export const attachmentsService = {
  presign: (fileName: string, mimeType: string, kind: string) =>
    api.post<PresignResponse>('/attachments/presign', { fileName, mimeType, kind }),

  register: (payload: RegisterAttachmentPayload) => api.post<Attachment>('/attachments', payload),

  listFor: (filters: AttachmentTarget) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    return api.get<Attachment[]>(`/attachments?${params.toString()}`);
  },

  remove: (id: string) => api.delete(`/attachments/${id}`),

  /** Televerse directement le fichier vers le stockage objet via l'URL signee, puis enregistre les metadonnees. */
  async uploadAndRegister(file: Blob & { name?: string }, fileName: string, kind: string, target: AttachmentTarget, capturedAt?: string): Promise<Attachment> {
    const mimeType = file.type || 'application/octet-stream';
    const { uploadUrl, fileUrl } = await attachmentsService.presign(fileName, mimeType, kind);
    let putRes: Response;
    try {
      putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: file });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Impossible de joindre le serveur de fichiers.');
    }
    if (!putRes.ok) throw new Error('Le televersement du fichier a echoue.');
    return attachmentsService.register({ fileName, fileUrl, mimeType, fileSizeBytes: file.size, kind, ...target, capturedAt });
  },
};
