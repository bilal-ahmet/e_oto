/**
 * Dış servis çağrıları için zaman aşımı yardımcıları.
 *
 * NEDEN: fal.subscribe / Anthropic / Etsy / Spaces çağrılarının hiçbirinde timeout yoktu.
 * fal bir işi kuyrukta unuttuğunda `approveSeoAndProcess` sonsuza kadar asılı kalıyor, run
 * `processing_files`'ta donuyor ve tek çıkış yolu 15 dk'lık kurtarma sweeper'ı oluyordu.
 * Artık her adım sınırlı sürede ya biter ya da anlaşılır bir hatayla düşer.
 */

/** Zaman aşımına uğrayan çağrılar bu hata tipiyle düşer (çağıran ayırt edebilsin diye). */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} ${Math.round(ms / 1000)} sn içinde tamamlanmadı (zaman aşımı).`);
    this.name = 'TimeoutError';
  }
}

/**
 * Bir promise'i zaman aşımına bağlar. Kaynak promise iptal EDİLEMEZ (fal SDK abort kabul etmiyor);
 * yalnızca beklemeyi bırakırız — bu yüzden arka planda kalan işin yan etkisi olmamalı.
 * İptal edilebilen fetch'ler için `fetchWithTimeout` kullanın.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/** AbortSignal ile GERÇEKTEN iptal edilen fetch (bağlantı kapanır, soket sızmaz). */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 60_000,
  label = 'İstek',
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (err) {
    // undici abort'u TimeoutError/AbortError olarak verir — anlaşılır mesaja çevir.
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new TimeoutError(label, ms);
    }
    throw err;
  }
}

/** Adım bazlı zaman aşımı bütçeleri (ms) — tek yerden ayarlanır. */
export const TIMEOUTS = {
  /** clarity-upscaler ×4 — en ağır fal işi. */
  upscale: 10 * 60_000,
  /** Tek bir flux-kontext mockup sahnesi. */
  mockup: 5 * 60_000,
  /** flux/imagen varyasyon üretimi (4 varyasyona kadar). */
  imageGen: 8 * 60_000,
  /** Claude vision SEO çağrısı. */
  claude: 3 * 60_000,
  /** Etsy REST çağrısı (medya yüklemeleri dahil). */
  etsy: 2 * 60_000,
  /** fal storage upload / CDN indirme. */
  transfer: 3 * 60_000,
  /** ffmpeg zoom videosu. */
  video: 5 * 60_000,
} as const;
