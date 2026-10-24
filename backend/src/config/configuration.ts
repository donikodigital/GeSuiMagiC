//backend/src/config/configuration.ts

/**
 * Valeur du reglage Express "trust proxy".
 *  - TRUST_PROXY absent : 1 en production (un seul proxy devant l'API : Render,
 *    Railway, Fly...), false en dev.
 *  - "false" / "0" : aucun proxy de confiance.
 *  - nombre ("2") : nombre de sauts de proxy (ex: Cloudflare + proxy de l'hebergeur).
 *  - autre chaine ("loopback", un sous-reseau CIDR...) : transmise telle quelle a Express.
 * NE JAMAIS utiliser "true" : Express ferait confiance a n'importe quel
 * X-Forwarded-For, donc l'IP (rate-limit, audit) serait falsifiable.
 */
function parseTrustProxy(raw: string | undefined, env: string): boolean | number | string {
  if (raw === undefined || raw.trim() === '') return env === 'production' ? 1 : false;
  const value = raw.trim();
  if (value === 'false' || value === '0') return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (value === 'true') return 1;
  return value;
}

export default () => {
  const env = process.env.NODE_ENV || 'development';

  return {
    env,
    port: parseInt(process.env.PORT || '4000', 10),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()),
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY, env),

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

    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      fromEmail: process.env.SMTP_FROM_EMAIL || 'Suivi de Chantier <notifications@example.com>',
      // Delais maximum (ms) : sans eux, un serveur SMTP qui ne repond pas
      // pouvait bloquer une requete HTTP pendant plusieurs minutes.
      connectionTimeoutMs: parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS || '10000', 10),
      socketTimeoutMs: parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS || '15000', 10),
    },

    storage: {
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION || 'auto',
      bucket: process.env.STORAGE_BUCKET || 'chantier-files',
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
      publicUrl: process.env.STORAGE_PUBLIC_URL,
      // true : bucket PRIVE. Les fichiers ne sont jamais accessibles par une
      // URL publique : l'API renvoie une URL signee de courte duree a chaque lecture.
      privateBucket: (process.env.STORAGE_PRIVATE ?? 'false') === 'true',
      signedUrlTtlSeconds: parseInt(process.env.STORAGE_SIGNED_URL_TTL_SECONDS || '900', 10),
      maxFileSizeMb: parseInt(process.env.STORAGE_MAX_FILE_SIZE_MB || '15', 10),
    },

    // Canaux WhatsApp / SMS (Twilio). Sans identifiants, ces canaux sont simplement indisponibles.
    messaging: {
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      // Expediteurs : "whatsapp:+14155238886" (WhatsApp) et numero ou identifiant alphanumerique (SMS)
      whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
      smsFrom: process.env.TWILIO_SMS_FROM,
      timeoutMs: parseInt(process.env.MESSAGING_TIMEOUT_MS || '5000', 10),
    },

    // Taches planifiees (rapport mensuel, alertes d'expiration, rappels de saisie) declenchees par un planificateur externe
    // (Vercel Cron, cron-job.org...) via GET /api/cron/daily avec l'en-tete "Authorization: Bearer <CRON_SECRET>".
    cron: {
      secret: process.env.CRON_SECRET,
    },

    defaultCurrency: process.env.DEFAULT_CURRENCY || 'GNF',

    // Anti-fractionnement : une depense auto-validee (sous le seuil) passe en
    // attente de confirmation du client si le cumul des depenses du meme
    // superviseur sur cette fenetre depasse le seuil. 0 = desactive.
    expenses: {
      cumulativeWindowHours: parseInt(process.env.EXPENSE_CUMULATIVE_WINDOW_HOURS || '24', 10),
    },

    throttle: {
      ttl: parseInt(process.env.THROTTLE_TTL || '60', 10), // secondes
      limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
    },
  };
};
