/**
 * Etsy Open API v3 çağrı katmanı (CLAUDE.md §8, §10).
 * - getValidEtsyToken: DB'deki token'ı döner; süresi dolmuşsa refresh edip saklar.
 * - etsyFetch: throttle'lı (~10 req/s) + x-api-key + Bearer ile JSON çağrı.
 * Yalnızca server-side import edilir.
 */

import pThrottle from 'p-throttle';
import { getEnv } from '@/lib/env';
import { TIMEOUTS, fetchWithTimeout } from '@/lib/async/timeout';
import { singleFlight } from '@/lib/async/single-flight';
import { getOAuthToken, upsertOAuthToken } from '@/lib/db/queries';
import { refreshAccessToken } from './oauth';

const API_BASE = 'https://openapi.etsy.com/v3/application';

// Etsy ~10 req/s (CLAUDE.md §2, §10).
const throttle = pThrottle({ limit: 10, interval: 1000 });

/**
 * Yenilenen token'ı saklar.
 *
 * KRİTİK: Etsy yenileme yanıtında refresh_token'ı her zaman döndürmez. Gelen undefined'ı olduğu
 * gibi yazmak refresh_token_encrypted'ı NULL yapar (queries.upsertOAuthToken falsy değeri NULL'a
 * çevirir) ve bağlantıyı sessizce öldürür: bir sonraki yenileme yapılamaz, kullanıcı bunu ancak
 * yayın anında "Etsy bağlantısı yok" olarak görür. Bu yüzden gelmediğinde eldeki korunur.
 * (Aynı koruma Pinterest tarafında `pinterest/client.persistTokens` içindedir.)
 */
export async function persistEtsyTokens(
  accessToken: string,
  refreshToken: string | undefined,
  previousRefreshToken: string | null,
  expiresAt: Date | null,
): Promise<void> {
  await upsertOAuthToken('etsy', accessToken, refreshToken ?? previousRefreshToken, expiresAt);
}

const REFRESH_KEY = 'etsy:refresh';
const EXPIRY_BUFFER_MS = 60_000; // 60 sn tampon

/**
 * Token'ı yeniler ve saklar; yeni access token'ı döner (refresh token yoksa null).
 *
 * DAİMA `singleFlight(REFRESH_KEY, ...)` içinden çağrılır — hem `getValidEtsyToken` hem
 * cron'un çağırdığı `refreshEtsyTokenNow` aynı anahtarı ve AYNI dönüş tipini paylaşsın diye
 * tek fonksiyona indirildi (farklı tipli iki iş aynı anahtarı paylaşırsa biri diğerinin
 * sonucunu alır).
 */
async function refreshAndStore(force = false): Promise<string | null> {
  // Kuyrukta beklerken başka bir çağrı yenilemiş olabilir — DB'yi TEKRAR oku.
  const token = await getOAuthToken('etsy');
  if (!token?.refreshToken) return null;
  // `force` cron içindir: amacı süre dolmasa BİLE yenileyip 90 günlük pencereyi sıfırlamak.
  if (!force && token.expiresAt != null && token.expiresAt.getTime() - Date.now() >= EXPIRY_BUFFER_MS) {
    return token.accessToken; // başkası zaten tazeledi
  }
  const refreshed = await refreshAccessToken(token.refreshToken);
  await persistEtsyTokens(
    refreshed.accessToken,
    refreshed.refreshToken,
    token.refreshToken,
    refreshed.expiresAt,
  );
  return refreshed.accessToken;
}

/**
 * Geçerli (gerekirse yenilenmiş) Etsy access token döner.
 *
 * Yenileme `singleFlight` altındadır: eşzamanlı iki çağrı aynı refresh token'ı iki kez
 * kullanamaz (Etsy her kullanımda token'ı döndürür, ikinci istek ölü token'la gider).
 */
export async function getValidEtsyToken(): Promise<string> {
  const token = await getOAuthToken('etsy');
  if (!token) {
    throw new Error('Etsy bağlantısı yok — önce /api/auth/etsy/start ile yetkilendir.');
  }

  const expiringSoon =
    token.expiresAt != null && token.expiresAt.getTime() - Date.now() < EXPIRY_BUFFER_MS;

  if (expiringSoon && token.refreshToken) {
    const access = await singleFlight(REFRESH_KEY, refreshAndStore);
    if (!access) throw new Error('Etsy refresh token yok — yeniden yetkilendirme gerekiyor.');
    return access;
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
  // getValidEtsyToken ile AYNI anahtar: cron yenilemesi bir yayın adımının yenilemesiyle çakışamaz.
  // Çakışma anında devam eden (force'suz) yenilemeye katılıp sonucunu paylaşabilir; token yine
  // tazelenmiş olur ve cron ertesi gün yaşı yeniden değerlendirir.
  const access = await singleFlight(REFRESH_KEY, () => refreshAndStore(true));
  return access !== null;
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
