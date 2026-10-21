//backend/src/config/env.validation.ts
/**
 * Validation des variables d'environnement au demarrage (fail-fast).
 *
 * Avant : un JWT_SECRET absent faisait planter passport-jwt avec un message
 * obscur, et rien n'empechait d'utiliser le meme secret pour l'access token
 * et le refresh token (un refresh token de 30 jours pouvait alors servir
 * d'access token), ni de laisser les valeurs "change-me" de .env.example.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const isProd = env.NODE_ENV === 'production';

  const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  for (const key of required) {
    const value = env[key];
    if (typeof value !== 'string' || value.trim() === '') errors.push(`${key} est obligatoire.`);
  }

  const access = typeof env.JWT_SECRET === 'string' ? env.JWT_SECRET : '';
  const refresh = typeof env.JWT_REFRESH_SECRET === 'string' ? env.JWT_REFRESH_SECRET : '';

  if (access && refresh && access === refresh) {
    errors.push('JWT_SECRET et JWT_REFRESH_SECRET doivent etre differents.');
  }

  if (isProd) {
    for (const [key, value] of [
      ['JWT_SECRET', access],
      ['JWT_REFRESH_SECRET', refresh],
    ] as const) {
      if (value && value.length < 32) errors.push(`${key} doit faire au moins 32 caracteres en production.`);
      if (value && value.startsWith('change-me')) errors.push(`${key} utilise encore la valeur d'exemple de .env.example.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration invalide :\n - ${errors.join('\n - ')}`);
  }

  return env;
}
