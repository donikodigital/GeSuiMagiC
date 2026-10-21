//backend/src/common/utils/file-name.util.ts

/**
 * Transforme un libelle libre (ex: nom de projet) en nom de fichier sur : lettres/chiffres ASCII, "-" et "_".
 * Les accents sont retires (é -> e). Avant, le nom du projet etait injecte tel quel dans l'en-tete
 * Content-Disposition : un nom contenant des guillemets, des retours a la ligne ou des caracteres hors
 * Latin-1 faisait echouer la reponse (erreur 500) ou permettait d'injecter des en-tetes.
 */
export function toSafeFileName(label: string, fallback = 'projet'): string {
  const slug = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

/** En-tete Content-Disposition "attachment" avec un nom ASCII garanti sur. */
export function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
