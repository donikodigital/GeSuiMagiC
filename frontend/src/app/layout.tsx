//frontend/src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { fraunces, inter, plexMono } from '@/lib/fonts';
import { QueryProvider } from '@/components/providers/query-provider';
import { PwaRegister } from '@/components/pwa/pwa-register';
import './globals.css';

export const metadata: Metadata = {
  title: 'Suivi de Chantier',
  description: 'Plateforme de gestion financière et de suivi de chantier',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'GeSuiMagiC', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0B1330',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${fraunces.variable} ${inter.variable} ${plexMono.variable}`}>
      <body>
        <QueryProvider>
          <PwaRegister />
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
