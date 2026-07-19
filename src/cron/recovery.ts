/**
 * Pipeline kurtarma cron'u — askıda kalan run'ları periyodik olarak sürdürür + startup'ta bir kez çalışır.
 * instrumentation.ts tarafından (yalnızca Node runtime, tek sefer) kaydedilir.
 */

import cron from 'node-cron';
import { recoverStalledRuns } from '@/lib/pipeline/recovery';

let registered = false;

export function registerRecoveryCron(): void {
  if (registered) return;
  registered = true;
  // Her 2 dakikada bir askıda kalan run'ları tara/sürdür.
  cron.schedule('*/2 * * * *', () => {
    void recoverStalledRuns();
  });
  // Startup'ta bir kez — redeploy/restart sonrası hızlı toparlanma.
  void recoverStalledRuns();
  console.log('[cron] pipeline kurtarma görevi kaydedildi (*/2 * * * *).');
}
