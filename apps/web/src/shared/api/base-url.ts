const API_PREFIX = '/api/v1';

/**
 * Normalise l'origine API fournie au build Vercel.
 *
 * Une valeur telle que `api.example.com` est autrement interprétée par fetch
 * comme un chemin relatif et se retrouve concaténée au domaine du dashboard.
 */
export function normalizeApiBaseUrl(value: string | undefined): string {
  const configured = value?.trim();
  if (!configured) return API_PREFIX;

  if (configured.startsWith('/')) return configured.replace(/\/+$/, '') || API_PREFIX;

  const absolute = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  const url = new URL(absolute);
  if (url.pathname === '/' || url.pathname === '') url.pathname = API_PREFIX;

  return url.toString().replace(/\/+$/, '');
}

export const API_BASE = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
