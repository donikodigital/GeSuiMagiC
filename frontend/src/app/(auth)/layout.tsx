//frontend/src/app/(auth)/layout.tsx
// ============================================================================
// app/(auth)/layout.tsx - v1.1
// Ajout du logo GeSuiMagiC au-dessus du formulaire, dans le conteneur
// partage donc visible sur TOUTES les pages (auth) et a TOUTES les tailles
// d'ecran - contrairement au panneau navy de gauche, cache sous lg:.
// Le panneau desktop (icone HardHat + accroche) n'a pas ete touche : dis-moi
// si tu veux aussi y remplacer l'icone par le logo reel.
//
// A FAIRE DE TON COTE : enregistrer le PNG du logo dans
// frontend/public/logo.png (le nom doit correspondre exactement au src
// ci-dessous, ou adapte le src si tu choisis un autre nom/format).
// ============================================================================

import Image from 'next/image';
import { HardHat } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-10 text-white lg:flex">
        <div className="absolute inset-0 opacity-[0.07]" style={gridBackground} />
        <div className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-safety-400 text-ink-900">
            <HardHat className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-semibold">Suivi de Chantier</span>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-3xl font-semibold leading-tight">
            Chaque franc versé, chaque sac de ciment acheté — un registre que personne ne peut effacer.
          </p>
          <p className="mt-4 text-sm text-ink-300">
            Portefeuille financier independant par chantier. Historique inviolable. Solde toujours a jour.
          </p>
        </div>
        <p className="relative text-xs text-ink-400">© {new Date().getFullYear()} Suivi de Chantier</p>
      </div>

      <div className="flex items-center justify-center bg-paper px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Image
              src="/logo.png"
              alt="GeSuiMagiC - Gestion et Suivi magic des Chantiers"
              width={240}
              height={240}
              priority
              className="h-auto w-40 sm:w-48"
            />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

const gridBackground = {
  backgroundImage:
    'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};