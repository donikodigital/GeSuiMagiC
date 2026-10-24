//frontend/next.config.mjs
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // geolocation et camera : necessaires a la saisie terrain (position des depenses/livraisons, photos du journal).
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Aucun domaine distant : seules les images locales (ex: /logo.png) passent par l'optimiseur.
    // Avant, `hostname: '**'` autorisait l'optimiseur de Next a charger N'IMPORTE QUELLE image
    // distante (abus de ressources / SSRF). Les photos distantes sont affichees avec un <img> classique.
    remotePatterns: [],
    imageSizes: [16, 32, 48, 64, 96, 128, 240, 256, 384],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Le service worker doit toujours etre relu pour que les mises a jour de l'application arrivent.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

export default nextConfig;
