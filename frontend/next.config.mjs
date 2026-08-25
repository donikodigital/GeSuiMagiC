/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    imageSizes: [16, 32, 48, 64, 96, 128, 240, 256, 384],
  },
};

export default nextConfig;