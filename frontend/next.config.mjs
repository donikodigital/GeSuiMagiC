//frontend/next.config.mjs
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
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
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
