/**
 * Giriş denemesi sayacı — bellek içi, IP başına.
 *
 * Neden bellek içi yeterli: uygulama tek instance çalışır (.do/app.yaml → instance_count: 1).
 * KABUL EDİLEN SINIR: süreç yeniden başladığında sayaç sıfırlanır. İkinci savunma katmanı
 * scrypt'in ~100 ms maliyetidir (lib/auth/password.ts) — saniyede ~10 deneme tavanı koyar.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 dk
const MAX_ATTEMPTS = 10;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Sonsuz büyümeyi engelle: sözlük şiştiğinde süresi geçmişleri at. */
function sweep(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * App Platform/Cloudflare arkasında gerçek istemci IP'si x-forwarded-for'un İLK değeridir
 * (sonrakiler ara proxy'ler). Başlık yoksa tüm istekler tek kovaya düşer — bu bilinçli:
 * kimliklendirilemeyen trafik için sınırın gevşemesindense sıkılaşması yeğdir.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Denemeyi kaydeder ve izin verilip verilmediğini döner. Başarılı girişte reset() çağır. */
export function registerAttempt(ip: string): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  existing.count += 1;
  if (existing.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

/** Başarılı giriş sonrası sayacı temizle — doğru parolayı bilen kilitlenmesin. */
export function resetAttempts(ip: string): void {
  buckets.delete(ip);
}
