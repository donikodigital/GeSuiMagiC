//frontend/src/app/layout.tsx
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { fraunces, inter, plexMono } from '@/lib/fonts';
import { QueryProvider } from '@/components/providers/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Suivi de Chantier',
  description: 'Plateforme de gestion financiere et de suivi de chantier',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${fraunces.variable} ${inter.variable} ${plexMono.variable}`}>
      <body>
        <QueryProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: { fontFamily: 'var(--font-inter)', fontSize: '0.875rem' },
            }}
          />
        </QueryProvider>
      </body>
    </html>
  );
}
