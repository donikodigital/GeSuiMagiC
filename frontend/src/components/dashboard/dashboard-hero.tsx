// ============================================================================
// frontend/src/components/dashboard/dashboard-hero.tsx - v1.1
// Bandeau "hero" reutilisable pour les tableaux de bord (Superadmin/Client/Superviseur)
// Design : navy + or, inspire de la page de connexion GeSuiMagiC et du wallet
// Direct Transf'air (gros solde, oeil pour masquer, actions rapides)
// ============================================================================

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';

export interface DashboardHeroStat {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative';
}

export interface DashboardHeroAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface DashboardHeroProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  primaryLabel: string;
  primaryValue: string;
  primaryTone?: 'default' | 'negative';
  /** Affiche un oeil pour masquer/afficher la valeur principale (montants sensibles) */
  maskable?: boolean;
  stats?: DashboardHeroStat[];
  actions?: DashboardHeroAction[];
}

const STAT_TONE_CLASS: Record<NonNullable<DashboardHeroStat['tone']>, string> = {
  default: 'text-white',
  positive: 'text-[#8FE3B0]',
  negative: 'text-[#FFB4A2]',
};

export function DashboardHero({
  eyebrow,
  title,
  subtitle,
  primaryLabel,
  primaryValue,
  primaryTone = 'default',
  maskable = false,
  stats = [],
  actions = [],
}: DashboardHeroProps) {
  const [masked, setMasked] = useState(false);
  const displayValue = masked ? '•••• •••' : primaryValue;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1330] via-[#122057] to-[#1B2E6E] px-6 pb-8 pt-7 shadow-xl shadow-[#0B1330]/20 sm:px-9 sm:pb-10 sm:pt-8 lg:px-10">
      {/* Motif "plan d'architecte" en filigrane : cercle compas + amorces d'axes */}
      <svg
        aria-hidden="true"
        viewBox="0 0 240 240"
        className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 opacity-[0.10] sm:h-72 sm:w-72"
      >
        <circle cx="120" cy="120" r="96" fill="none" stroke="#E7D9AE" strokeWidth="1" strokeDasharray="2 6" />
        <circle cx="120" cy="120" r="70" fill="none" stroke="#E7D9AE" strokeWidth="1" />
        <path
          d="M120 8 L120 28 M120 212 L120 232 M8 120 L28 120 M212 120 L232 120"
          stroke="#E7D9AE"
          strokeWidth="1"
        />
      </svg>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#C9A24A]/10 blur-3xl"
      />

      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
        {/* Colonne gauche : identite + solde principal */}
        <div className="lg:max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C9A24A]">{eyebrow}</p>
          <h1 className="mt-2 font-display text-xl font-semibold text-white sm:text-2xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-white/60">{subtitle}</p> : null}

          <div className="mt-7">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/50">
              <span>{primaryLabel}</span>
              {maskable && (
                <button
                  type="button"
                  onClick={() => setMasked((m) => !m)}
                  className="text-white/50 transition hover:text-white"
                  aria-label={masked ? 'Afficher le montant' : 'Masquer le montant'}
                >
                  {masked ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            <p
              className={`mt-1 break-all font-ledger text-4xl font-bold tracking-tight sm:text-5xl ${
                primaryTone === 'negative' && !masked ? 'text-[#FFB4A2]' : 'text-white'
              }`}
            >
              {displayValue}
            </p>
          </div>
        </div>

        {/* Colonne droite : puces + action, alignees a droite sur desktop */}
        {(stats.length > 0 || actions.length > 0) && (
          <div className="flex flex-col gap-5 lg:w-80 lg:flex-shrink-0 lg:items-stretch lg:pt-1">
            {stats.length > 0 && (
              <div className="flex flex-wrap gap-2.5 lg:justify-end">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2 backdrop-blur-sm lg:min-w-[9.5rem]"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-white/45">{stat.label}</p>
                    <p className={`font-ledger text-sm font-semibold ${STAT_TONE_CLASS[stat.tone ?? 'default']}`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            {actions.length > 0 && (
              <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col">
                {actions.map((action, i) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.label}
                      href={action.href}
                      className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                        i === 0
                          ? 'bg-[#C9A24A] text-[#1B1400] hover:bg-[#D8B563]'
                          : 'border border-white/20 text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {action.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}