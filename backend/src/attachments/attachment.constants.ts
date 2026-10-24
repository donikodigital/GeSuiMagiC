//backend/src/attachments/attachment.constants.ts
export const ATTACHMENT_KINDS = ['photo', 'facture', 'recu', 'bon_livraison', 'document'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** Types MIME acceptes (voir ALLOWED_UPLOAD_TYPES dans storage.service.ts). */
export const ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'] as const;

/** Plafond absolu de taille declaree, quelle que soit la configuration (100 Mo). */
export const ATTACHMENT_ABSOLUTE_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Objets du chantier auxquels on peut rattacher des fichiers (photos, bons, devis...) en plus des depots et depenses.
 * Le projectId est alors obligatoire : c'est lui qui porte le controle d'acces.
 */
export const ATTACHMENT_ENTITY_TYPES = [
  'SiteLog',
  'Snag',
  'Reception',
  'ChangeOrder',
  'SupplierQuote',
  'Contract',
  'ProgressStatement',
  'ContractPayment',
  'Delivery',
  'StockMovement',
  'ProjectDocument',
  'PhaseProgressUpdate',
  'PurchaseOrder',
] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];
