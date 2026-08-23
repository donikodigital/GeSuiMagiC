import { api } from '@/lib/api-client';
import type { Attachment } from '@/types/models';

export interface PresignResponse {
  uploadUrl: string;
  fileUrl: string;
  key: string;
}

export const attachmentsService = {
  presign: (fileName: string, mimeType: string, kind: string) =>
    api.post<PresignResponse>('/attachments/presign', { fileName, mimeType, kind }),

  register: (payload: {
    fileName: string;
    fileUrl: string;
    mimeType: string;
    fileSizeBytes: number;
    kind: string;
    projectId?: string;
    depositId?: string;
    expenseId?: string;
  }) => api.post<Attachment>('/attachments', payload),

  listFor: (filters: { projectId?: string; depositId?: string; expenseId?: string }) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    return api.get<Attachment[]>(`/attachments?${params.toString()}`);
  },

  remove: (id: string) => api.delete(`/attachments/${id}`),

  /** Televerse directement le fichier vers le stockage objet via l'URL signee, puis enregistre les metadonnees. */
  async uploadAndRegister(
    file: File,
    kind: string,
    target: { projectId?: string; depositId?: string; expenseId?: string },
  ): Promise<Attachment> {
    const { uploadUrl, fileUrl } = await attachmentsService.presign(file.name, file.type, kind);
    const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!putRes.ok) throw new Error("Le televersement du fichier a echoue.");
    return attachmentsService.register({
      fileName: file.name,
      fileUrl,
      mimeType: file.type,
      fileSizeBytes: file.size,
      kind,
      ...target,
    });
  },
};
