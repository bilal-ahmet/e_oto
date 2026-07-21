/**
 * OAuth token canlı tutma cron'u (Etsy + Pinterest).
 *
 * NEDEN: Her iki sağlayıcının da refresh token'ı SÜRELİDİR ve her kullanımda yenilenir:
 *   - Etsy:      access 1 saat,  refresh ~90 gün
 *   - Pinterest: access 30 gün,  refresh  60 gün (continuous refresh — kullanıldıkça yaşar)
 *
 * Uygulama bu API'leri yalnızca yayın/pin anında çağırdığı için, iki yayın arasında pencere
 * dolarsa token ölür ve kullanıcı elle yeniden yetkilendirmek zorunda kalır (üstelik bunu
 * ancak hattın SONUNDA öğrenir).
 *
 * Bu görev günde bir kez, kayıt sağlayıcının eşiğinden eskiyse token'ı tazeler. Böylece
 * pencere hiçbir zaman dolmaz ve panelin "yeniden yetkilendir" uyarısı pratikte hiç çıkmaz.
 *
 * instrumentation.ts tarafından (yalnızca Node runtime, tek sefer) kaydedilir.
 */

import cron from 'node-cron';
import { getOAuthTokenMeta, withAdvisoryLock } from '@/lib/db/queries';
import { refreshEtsyTokenNow } from '@/lib/etsy/client';
import { refreshPinterestTokenNow } from '@/lib/pinterest/client';

let registered = false;
const LOCK_KEY = 728_403; // recovery (728401) ve rakip tarama (728402) ile çakışmaz

const DAY_MS = 24 * 60 * 60 * 1000;

interface Provider {
  name: 'etsy' | 'pinterest';
  label: string;
  /** Kayıt bu süreden eskiyse tazele. Sağlayıcının penceresine göre bol güvenlik payı bırakır. */
  staleMs: number;
  windowLabel: string;
  /** Dönüş değeri kullanılmaz (Etsy boolean, Pinterest void döner) — önemli olan atmaması. */
  refresh: () => Promise<unknown>;
}

const PROVIDERS: Provider[] = [
  {
    name: 'etsy',
    label: 'Etsy',
    staleMs: 3 * DAY_MS,
    windowLabel: '90 günlük',
    refresh: refreshEtsyTokenNow,
  },
  {
    name: 'pinterest',
    label: 'Pinterest',
    staleMs: 7 * DAY_MS,
    windowLabel: '60 günlük',
    refresh: refreshPinterestTokenNow,
  },
];

async function keepAliveOne(p: Provider): Promise<void> {
  const meta = await getOAuthTokenMeta(p.name);
  if (!meta.connected) return; // hiç bağlanmamış — yapacak bir şey yok
  if (!meta.hasRefreshToken) {
    console.warn(`[cron] ${p.label} kaydında refresh_token yok — süre dolunca yeniden yetkilendirme gerekecek.`);
    return;
  }
  const age = meta.updatedAt ? Date.now() - meta.updatedAt.getTime() : Infinity;
  if (age < p.staleMs) return; // yeterince taze

  await p.refresh();
  console.log(`[cron] ${p.label} token tazelendi — ${p.windowLabel} refresh penceresi sıfırlandı.`);
}

async function keepAlive(): Promise<void> {
  try {
    await withAdvisoryLock(LOCK_KEY, async () => {
      for (const p of PROVIDERS) {
        try {
          await keepAliveOne(p);
        } catch (e) {
          // Bir sağlayıcının refresh token'ı gerçekten öldüyse burada patlar; DİĞERİNİ
          // etkilememesi için hata sağlayıcı bazında yakalanır. Kullanıcı panelde ilgili
          // "bağlı değil" uyarısını görür ve tek tıkla yeniden yetkilendirir.
          console.error(`[cron] ${p.label} token tazelenemedi:`, e instanceof Error ? e.message : e);
        }
      }
    });
  } catch (e) {
    console.error('[cron] Token tazeleme görevi çalıştırılamadı:', e instanceof Error ? e.message : e);
  }
}

/** Cron görevini kaydeder (her gün 04:00) + startup'ta bir kez çalıştırır. */
export function registerTokenRefreshCron(): void {
  if (registered) return;
  registered = true;
  cron.schedule('0 4 * * *', () => {
    void keepAlive();
  });
  void keepAlive(); // deploy sonrası hemen bir kez
  console.log('[cron] Token tazeleme görevi kaydedildi (Etsy + Pinterest, 0 4 * * *).');
}
