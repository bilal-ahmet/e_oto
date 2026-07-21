/**
 * Pinterest API host çözümü — sandbox / production (CLAUDE.md §8).
 *
 * NEDEN VAR: Trial access'teki uygulamalar production'da (`api.pinterest.com`) pin
 * OLUŞTURAMAZ; `api-sandbox.pinterest.com` kullanmak zorundadır. Host iki ayrı dosyada
 * (client.ts + oauth.ts) sabit yazılıydı; standart erişime geçerken tek yerden
 * çevrilebilsin diye burada toplandı.
 *
 * DİKKAT: Sandbox token'ı production'da, production token'ı sandbox'ta GEÇERSİZDİR.
 * PINTEREST_API_ENV değiştiğinde yeniden yetkilendirme şarttır — bu yüzden token
 * kaydedilirken hangi ortama ait olduğu da (`pinterest_token_env` ayarı) saklanır ve
 * bağlantı kartı uyuşmazlıkta uyarır.
 */

import { getEnv } from '@/lib/env';

export type PinterestApiEnv = 'sandbox' | 'production';

/**
 * Kullanıcının Pinterest'e yönlendirildiği yetkilendirme sayfası.
 * Sandbox'ta DA aynıdır — yalnızca token exchange ve API çağrıları host değiştirir.
 */
export const AUTH_URL = 'https://www.pinterest.com/oauth/';

/** Aktif ortam (varsayılan production; trial sürecinde .env'de `sandbox` yapılır). */
export function apiEnv(): PinterestApiEnv {
  return getEnv().PINTEREST_API_ENV;
}

/** Aktif ortamın v5 API tabanı (sonda eğik çizgi YOK). */
export function apiBase(): string {
  return apiEnv() === 'sandbox'
    ? 'https://api-sandbox.pinterest.com/v5'
    : 'https://api.pinterest.com/v5';
}

/** Token alma/yenileme ucu — API tabanıyla aynı host'ta olmalıdır. */
export function tokenUrl(): string {
  return `${apiBase()}/oauth/token`;
}

/** Trial (sandbox) modunda mıyız — UI'da "pinler yalnızca size görünür" uyarısı için. */
export function isSandbox(): boolean {
  return apiEnv() === 'sandbox';
}
