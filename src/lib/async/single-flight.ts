/**
 * Tek-uçuş (single-flight): aynı anahtar için çalışan bir iş varsa yenisini BAŞLATMAZ,
 * devam edeni bekletir. Sonuç herkese aynı promise'ten döner.
 *
 * NEDEN (OAuth token yenileme): hem Etsy hem Pinterest, refresh token'ı her kullanımda
 * döndürür — eski token o anda geçersizleşir. İki eşzamanlı çağrı aynı anda "süresi doluyor"
 * görüp ikisi birden yenilemeye kalkarsa, ikincisi ARTIK GEÇERSİZ bir refresh token'la istek
 * atar; en iyi ihtimalle hata alır, en kötüsünde DB'ye eski/ölü bir token yazılır ve bağlantı
 * sessizce kopar. Pratikte tetikleyici: gece 04:00 token cron'unun bir yayın adımıyla çakışması.
 *
 * Not: koruma SÜREÇ İÇİDİR. Birden fazla instance çalıştırılacaksa yenilemenin de advisory
 * lock'a alınması gerekir (bugün instance_count=1).
 */

const inFlight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key);
  if (running) return running as Promise<T>;

  // finally SENKRON zincirlenir: promise yerleşir yerleşmez kayıt silinir, böylece bir sonraki
  // çağrı bayat bir sonucu paylaşmaz (başarısız yenileme de tekrar denenebilir olmalı).
  const p = fn().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}
