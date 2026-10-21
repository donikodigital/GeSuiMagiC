//backend/src/attachments/attachment.constants.ts
export const ATTACHMENT_KINDS = ['photo', 'facture', 'recu', 'bon_livraison', 'document'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** Types MIME acceptes (voir ALLOWED_UPLOAD_TYPES dans storage.service.ts). */
export const ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'] as const;

/** Plafond absolu de taille declaree, quelle que soit la configuration (100 Mo). */
export const ATTACHMENT_ABSOLUTE_MAX_BYTES = 100 * 1024 * 1024;
