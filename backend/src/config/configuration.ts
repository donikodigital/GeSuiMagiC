export default () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()),

  database: {
    url: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
  },

  jwt: {
    accessSecret: process.env.JWT_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  invitation: {
    tokenExpiresInHours: parseInt(process.env.INVITATION_TOKEN_EXPIRES_IN_HOURS || '48', 10),
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL || 'Chantier <notifications@example.com>',
  },

  storage: {
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION || 'auto',
    bucket: process.env.STORAGE_BUCKET || 'chantier-files',
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
    publicUrl: process.env.STORAGE_PUBLIC_URL,
    maxFileSizeMb: parseInt(process.env.STORAGE_MAX_FILE_SIZE_MB || '15', 10),
  },

  defaultCurrency: process.env.DEFAULT_CURRENCY || 'GNF',

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },
});
