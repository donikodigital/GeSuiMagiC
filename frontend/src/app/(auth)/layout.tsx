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
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

const gridBackground = {
  backgroundImage:
    'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};
