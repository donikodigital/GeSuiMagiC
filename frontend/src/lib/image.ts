//frontend/src/lib/image.ts
const MAX_SIDE = 1800;
const SKIP_BELOW_BYTES = 900 * 1024;

/**
 * Reduit une photo de telephone (souvent 4 a 8 Mo) avant envoi : indispensable sur un reseau mobile faible et pour la
 * file hors ligne. Les PDF et les petites images sont laisses tels quels ; en cas d'echec on garde l'original.
 */
export async function prepareImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < SKIP_BELOW_BYTES || typeof createImageBitmap === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
export const MAX_FILE_MB = 15;

/** Message d'erreur si le fichier est refuse, sinon null. */
export function validateFile(file: File): string | null {
  if (!ACCEPTED_FILE_TYPES.includes(file.type)) return 'Formats acceptés : JPG, PNG ou PDF.';
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `Le fichier dépasse ${MAX_FILE_MB} Mo.`;
  return null;
}
