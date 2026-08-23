import type { Config } from 'tailwindcss';

/**
 * Identite visuelle "carnet de chantier" :
 * - ink/blueprint : bleu ardoise profond (continuite avec l'en-tete des PDF generes cote backend)
 * - paper/concrete : fond chaud, jamais blanc pur, evoque le papier calque des plans
 * - rebar : accent rouille/rebar, jamais utilise pour de grandes surfaces
 * - safety : jaune securite chantier, reserve aux etats "en attente / alerte"
 * - moss / clay : validation / refus
 *
 * Signature recurrente : tous les montants financiers sont rendus en police
 * monospace tabulaire (voir .font-ledger), comme des ecritures dans un
 * registre - jamais en police UI standard.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0b1220',
          50: '#f3f5f8',
          100: '#e4e8ef',
          200: '#c3cddb',
          300: '#93a4bd',
          400: '#5d7398',
          500: '#3d5678',
          600: '#2c4160',
          700: '#22334c',
          800: '#182337',
          900: '#0b1220',
          950: '#060a13',
        },
        blueprint: {
          DEFAULT: '#1e3a5f',
          50: '#eef4fa',
          100: '#d7e5f2',
          200: '#aec9e3',
          300: '#7fa9d1',
          400: '#4d80b1',
          500: '#2f6193',
          600: '#254d78',
          700: '#1e3a5f',
          800: '#182f4c',
          900: '#13253c',
        },
        paper: {
          DEFAULT: '#f7f4ec',
          dark: '#efe9db',
        },
        concrete: {
          DEFAULT: '#d9d3c4',
          light: '#e8e3d6',
          dark: '#a39c8a',
        },
        rebar: {
          DEFAULT: '#b5541f',
          50: '#fdf3ed',
          100: '#fae1cf',
          200: '#f2bd9a',
          300: '#e6935f',
          400: '#cf7238',
          500: '#b5541f',
          600: '#924317',
          700: '#713414',
        },
        safety: {
          DEFAULT: '#d99a1b',
          50: '#fdf7e6',
          100: '#f9e8b8',
          200: '#f2d179',
          300: '#e8b944',
          400: '#d99a1b',
          500: '#b17c14',
        },
        moss: {
          DEFAULT: '#3f6b4f',
          50: '#eef4f0',
          100: '#d3e3d8',
          200: '#a4c7b0',
          300: '#729d81',
          400: '#4c7f5d',
          500: '#3f6b4f',
          600: '#31533e',
        },
        clay: {
          DEFAULT: '#a63636',
          50: '#fbeded',
          100: '#f3caca',
          200: '#e39a9a',
          300: '#cc6969',
          400: '#b84848',
          500: '#a63636',
          600: '#852a2a',
        },
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'ui-serif', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        ledger: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,18,32,0.04), 0 1px 12px rgba(11,18,32,0.05)',
        stamp: '0 0 0 1px rgba(11,18,32,0.08)',
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
};

export default config;
