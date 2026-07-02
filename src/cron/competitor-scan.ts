/**
 * Zamanlanmış rakip tarama (CLAUDE.md §1 madde 8, cron).
 * DB'deki kayıtlı rakip mağazaları periyodik olarak yeniden tarar.
 * instrumentation.ts tarafından (yalnızca Node runtime, tek sefer) kaydedilir.
 */

import cron from 'node-cron';
import { listCompetitorShops } from '@/lib/db/queries';
import { scanCompetitor } from '@/lib/scoring/competitor-algorithm';

let registered = false;

async function runScanAll(): Promise<void> {
  try {
    const shops = await listCompetitorShops();
    for (const shop of shops) {
      try {
        await scanCompetitor({ shopId: shop.shopId });
      } catch (e) {
        console.error(`[cron] ${shop.shopName} tarama hatası:`, e instanceof Error ? e.message : e);
      }
    }
    console.log(`[cron] rakip tarama tamam — ${shops.length} mağaza.`);
  } catch (e) {
    console.error('[cron] rakip tarama başlatılamadı:', e instanceof Error ? e.message : e);
  }
}

/** Cron görevini kaydeder (her gün 03:00). Tekrar kaydı önler. */
export function registerCompetitorScanCron(): void {
  if (registered) return;
  registered = true;
  // Her gün gece 03:00'te.
  cron.schedule('0 3 * * *', () => {
    void runScanAll();
  });
  console.log('[cron] rakip tarama görevi kaydedildi (0 3 * * *).');
}
