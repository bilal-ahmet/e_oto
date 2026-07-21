/**
 * Etsy Open API v3 çağrı katmanı (CLAUDE.md §8, §10).
 * - getValidEtsyToken: DB'deki token'ı döner; süresi dolmuşsa refresh edip saklar.
 * - etsyFetch: throttle'lı (~10 req/s) + x-api-key + Bearer ile JSON çağrı.
 * Yalnızca server-side import edilir.
 */

import pThrottle from 'p-throttle';
import { getEnv } from '@/lib/env';
import { TIMEOUTS, fetchWithTimeout } from '@/lib/async/timeout';
import { getOAuthToken, upsertOAuthToken } from '@/lib/db/queries';
import { refreshAccessToken } from './oauth';

const API_BASE = 'https://openapi.etsy.com/v3/application';

// Etsy ~10 req/s (CLAUDE.md §2, §10).
const throttle = pThrottle({ limit: 10, interval: 1000 });

/** Geçerli (gerekirse yenilenmiş) Etsy access token döner. */
export async function getValidEtsyToken(): Promise<string> {
  const token = await getOAuthToken('etsy');
  if (!token) {
    throw new Error('Etsy bağlantısı yok — önce /api/auth/etsy/start ile yetkilendir.');
  }

  const expiringSoon =
    token.expiresAt != null && token.expiresAt.getTime() - Date.now() < 60_000; // 60 sn tampon

  if (expiringSoon && token.refreshToken) {
    const refreshed = await refreshAccessToken(token.refreshToken);
    await upsertOAuthToken('etsy', refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt);
    return refreshed.accessToken;
  }

  return token.accessToken;
}

/**
 * Access token'ın süresi dolmamış olsa bile refresh_token'ı KULLANIR ve yenisini saklar.
 *
 * NEDEN: Etsy'nin refresh token'ı ~90 gün geçerlidir ve her kullanımda yenilenir (sayaç sıfırlanır).
 * Uygulama Etsy'yi yalnızca yayın anında çağırdığından, iki yayın arasında 90 gün geçerse token
 * ölür ve elle yeniden yetkilendirme gerekir. `cron/token-refresh.ts` bunu periyodik çağırarak
 * sayacı sürekli sıfır tutar — kullanıcının hiçbir şey yapması gerekmez.
 *
 * @returns Yenileme yapıldıysa true; token yoksa/refresh_token yoksa false.
 */
export async function refreshEtsyTokenNow(): Promise<boolean> {
  const token = await getOAuthToken('etsy');
  if (!token?.refreshToken) return false;
  const refreshed = await refreshAccessToken(token.refreshToken);
  await upsertOAuthToken('etsy', refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt);
  return true;
}

interface EtsyFetchOptions {
  method?: string;
  /** JSON gövde (Content-Type otomatik application/json). */
  json?: unknown;
  /** Ham gövde (FormData vb. — Content-Type elle yönetilir). */
  body?: BodyInit;
  headers?: Record<string, string>;
  /** application/x-www-form-urlencoded gövde. */
  form?: Record<string, string | number>;
}

// Zaman aşımlı: Etsy medya yüklemeleri (görsel/video/dosya) yanıtsız kalırsa yayın adımı
// `publishing_etsy`'de asılı kalmasın — checkpoint zaten yüklenenleri koruyor, tekrar denenebilir.
const rawFetch = throttle(
  async (url: string, init: RequestInit): Promise<Response> =>
    fetchWithTimeout(url, init, TIMEOUTS.etsy, 'Etsy API çağrısı'),
);

/**
 * Etsy API'ye throttle'lı, kimlikli çağrı. `path` API_BASE'e göre relatif (örn. `/users/me`).
 * 2xx değilse hata fırlatır. JSON döner (T).
 */
export async function etsyFetch<T = unknown>(path: string, opts: EtsyFetchOptions = {}): Promise<T> {
  const env = getEnv();
  if (!env.ETSY_CLIENT_ID) throw new Error('ETSY_CLIENT_ID tanımlı değil.');
  // Etsy (2026-02-09'dan beri) x-api-key'i `keystring:shared_secret` formatında ister.
  if (!env.ETSY_CLIENT_SECRET) {
    throw new Error('ETSY_CLIENT_SECRET tanımlı değil — Etsy artık x-api-key için shared secret istiyor.');
  }

  const accessToken = await getValidEtsyToken();
  const headers: Record<string, string> = {
    'x-api-key': `${env.ETSY_CLIENT_ID}:${env.ETSY_CLIENT_SECRET}`,
    Authorization: `Bearer ${accessToken}`,
    ...opts.headers,
  };

  let body: BodyInit | undefined = opts.body;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.form !== undefined) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(
      Object.fromEntries(Object.entries(opts.form).map(([k, v]) => [k, String(v)])),
    ).toString();
  }

  const url = `${API_BASE}${path}`;
  const res = await rawFetch(url, { method: opts.method ?? 'GET', headers, body });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy API hatası ${res.status} (${path}): ${text}`);
  }
  // 204 vb. boş gövde
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Etsy'nin PUBLIC uçları için throttle'lı çağrı (örn. GET /listings/{id}).
 * Yalnız `x-api-key` gönderir — OAuth Bearer GEREKMEZ; token yoksa da çalışır.
 * 2xx değilse hata fırlatır. JSON döner (T).
 */
export async function etsyPublicFetch<T = unknown>(path: string): Promise<T> {
  const env = getEnv();
  if (!env.ETSY_CLIENT_ID) throw new Error('ETSY_CLIENT_ID tanımlı değil.');
  if (!env.ETSY_CLIENT_SECRET) {
    throw new Error('ETSY_CLIENT_SECRET tanımlı değil — Etsy x-api-key için shared secret istiyor.');
  }

  const headers: Record<string, string> = {
    'x-api-key': `${env.ETSY_CLIENT_ID}:${env.ETSY_CLIENT_SECRET}`,
  };

  const res = await rawFetch(`${API_BASE}${path}`, { method: 'GET', headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy API hatası ${res.status} (${path}): ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export { API_BASE };
