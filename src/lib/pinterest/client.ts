/**
 * Pinterest API v5 çağrı katmanı (CLAUDE.md §8, §10).
 * - getValidPinterestToken: DB'deki token'ı döner; süresi dolmuşsa refresh edip saklar.
 * - pinterestFetch: throttle'lı (~100 req/dk) + Bearer ile JSON çağrı.
 * Yalnızca server-side import edilir.
 */

import pThrottle from 'p-throttle';
import { getOAuthToken, setSetting, upsertOAuthToken } from '@/lib/db/queries';
import { refreshAccessToken } from './oauth';
import { apiBase, apiEnv } from './hosts';

// Pinterest yazma ~100 req/dk (CLAUDE.md §10) — güvenlik payı ile 90.
const throttle = pThrottle({ limit: 90, interval: 60_000 });

// Access token 30 gün geçerli; tampon geniş tutulur çünkü pipeline adımları uzun sürebilir
// ve tam ortasında süresi dolan bir token'la 401 almak istemiyoruz.
const EXPIRY_BUFFER_MS = 5 * 60_000;

/**
 * Yenilenen token'ı saklar.
 *
 * KRİTİK: Pinterest yenileme yanıtında refresh_token'ı her zaman döndürmez. undefined'ı
 * olduğu gibi yazmak refresh_token_encrypted'ı NULL yapar ve bağlantıyı sessizce öldürür —
 * bu yüzden gelmediğinde eldeki refresh token korunur. Ayrıca token'ın hangi Pinterest
 * ortamına ait olduğu da işaretlenir (sandbox token'ı production'da geçersizdir).
 */
async function persistTokens(
  accessToken: string,
  refreshToken: string | undefined,
  previousRefreshToken: string | null,
  expiresAt: Date,
): Promise<void> {
  await upsertOAuthToken('pinterest', accessToken, refreshToken ?? previousRefreshToken, expiresAt);
  await setSetting('pinterest_token_env', apiEnv());
}

/** Geçerli (gerekirse yenilenmiş) Pinterest access token döner. */
export async function getValidPinterestToken(): Promise<string> {
  const token = await getOAuthToken('pinterest');
  if (!token) {
    throw new Error('Pinterest bağlantısı yok — önce /api/auth/pinterest/start ile yetkilendir.');
  }

  const expiringSoon =
    token.expiresAt != null && token.expiresAt.getTime() - Date.now() < EXPIRY_BUFFER_MS;

  if (expiringSoon && token.refreshToken) {
    const refreshed = await refreshAccessToken(token.refreshToken);
    await persistTokens(refreshed.accessToken, refreshed.refreshToken, token.refreshToken, refreshed.expiresAt);
    return refreshed.accessToken;
  }

  return token.accessToken;
}

/**
 * Token'ı son kullanma tarihine bakmadan ŞİMDİ yeniler (cron/token-refresh.ts kullanır).
 * Amaç 60 günlük refresh penceresinin hiç dolmaması — bkz. oauth.refreshAccessToken.
 */
export async function refreshPinterestTokenNow(): Promise<void> {
  const token = await getOAuthToken('pinterest');
  if (!token?.refreshToken) {
    throw new Error('Pinterest refresh token yok — yeniden yetkilendirme gerekiyor.');
  }
  const refreshed = await refreshAccessToken(token.refreshToken);
  await persistTokens(refreshed.accessToken, refreshed.refreshToken, token.refreshToken, refreshed.expiresAt);
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
 * Pinterest API'ye throttle'lı, kimlikli çağrı. `path` aktif ortamın tabanına (bkz. hosts.apiBase)
 * göre relatiftir (örn. `/pins`).
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

  const url = `${apiBase()}${path}`;
  const res = await rawFetch(url, { method: opts.method ?? 'GET', headers, body });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest API hatası ${res.status} (${path}, ortam: ${apiEnv()}): ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
