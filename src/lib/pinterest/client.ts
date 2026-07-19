/**
 * Pinterest API v5 çağrı katmanı (CLAUDE.md §8, §10).
 * - getValidPinterestToken: DB'deki token'ı döner; süresi dolmuşsa refresh edip saklar.
 * - pinterestFetch: throttle'lı (~100 req/dk) + Bearer ile JSON çağrı.
 * Yalnızca server-side import edilir.
 */

import pThrottle from 'p-throttle';
import { getOAuthToken, upsertOAuthToken } from '@/lib/db/queries';
import { refreshAccessToken } from './oauth';

const API_BASE = 'https://api.pinterest.com/v5';

// Pinterest yazma ~100 req/dk (CLAUDE.md §10) — güvenlik payı ile 90.
const throttle = pThrottle({ limit: 90, interval: 60_000 });

/** Geçerli (gerekirse yenilenmiş) Pinterest access token döner. */
export async function getValidPinterestToken(): Promise<string> {
  const token = await getOAuthToken('pinterest');
  if (!token) {
    throw new Error('Pinterest bağlantısı yok — önce /api/auth/pinterest/start ile yetkilendir.');
  }

  const expiringSoon =
    token.expiresAt != null && token.expiresAt.getTime() - Date.now() < 60_000; // 60 sn tampon

  if (expiringSoon && token.refreshToken) {
    const refreshed = await refreshAccessToken(token.refreshToken);
    await upsertOAuthToken('pinterest', refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt);
    return refreshed.accessToken;
  }

  return token.accessToken;
}

interface PinterestFetchOptions {
  method?: string;
  json?: unknown;
  headers?: Record<string, string>;
}

const rawFetch = throttle(
  async (url: string, init: RequestInit): Promise<Response> => fetch(url, init),
);

/**
 * Pinterest API'ye throttle'lı, kimlikli çağrı. `path` API_BASE'e göre relatif (örn. `/pins`).
 * Bearer-only auth (Etsy'deki x-api-key kavramı yok). 2xx değilse hata fırlatır. JSON döner (T).
 */
export async function pinterestFetch<T = unknown>(path: string, opts: PinterestFetchOptions = {}): Promise<T> {
  const accessToken = await getValidPinterestToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...opts.headers,
  };

  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }

  const url = `${API_BASE}${path}`;
  const res = await rawFetch(url, { method: opts.method ?? 'GET', headers, body });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest API hatası ${res.status} (${path}): ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export { API_BASE };
