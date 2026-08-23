import { Fraunces, Inter, IBM_Plex_Mono } from 'next/font/google';

/**
 * Fraunces : titres et gros chiffres du tableau de bord, utilisee avec
 * parcimonie (voir skill frontend-design - la personnalite typographique
 * de la page, pas un vehicule neutre).
 * Inter : interface, formulaires, tableaux.
 * IBM Plex Mono : TOUS les montants financiers (signature "registre de
 * chantier" - chiffres tabulaires alignes comme dans un cahier de comptes).
 */
export const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  weight: ['500', '600', '700'],
  display: 'swap',
});

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
});
