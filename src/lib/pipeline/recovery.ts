/**
 * Pipeline kurtarma — restart/çökme sonrası askıda kalan run'ları sürdürür.
 *
 * Arka plan adımları HTTP yanıtından sonra await'siz çalıştığı için, instance yeniden başlarsa
 * yarım kalan bir run transient statüde (generating_seo / processing_files / publishing_etsy) takılır.
 * Bu modül periyodik (cron) + startup'ta çalışıp bu run'ları idempotent step fonksiyonlarıyla
 * kaldığı yerden devam ettirir. PG advisory lock ile aynı anda tek instance çalışır.
 */

import {
  incrementRunAttempts,
  listStalledRuns,
  releaseAdvisoryLock,
  tryAdvisoryLock,
  updatePipelineRun,
} from '@/lib/db/queries';
import { approveSeoAndProcess, publishToEtsy, selectImageForRun } from './run';

const STALL_MS = 15 * 60 * 1000; // 15 dk hareketsizlik → askıda say
const MAX_ATTEMPTS = 5; // bu kadar kurtarma denemesinden sonra hata olarak işaretle
const LOCK_KEY = 728_401; // recovery advisory lock (rakip taramadan farklı)

/** Askıda kalan run'ları bulur ve idempotent olarak sürdürür. Advisory lock alamazsa sessizce döner. */
export async function recoverStalledRuns(): Promise<void> {
  if (!(await tryAdvisoryLock(LOCK_KEY))) return; // başka instance kurtarma yapıyor
  try {
    const stalled = await listStalledRuns(STALL_MS);
    for (const run of stalled) {
      try {
        const attempts = await incrementRunAttempts(run.id);
        if (attempts > MAX_ATTEMPTS) {
          await updatePipelineRun(run.id, {
            status: 'error',
            errorMessage: `Otomatik kurtarma ${MAX_ATTEMPTS} denemede başarısız — manuel inceleme gerekli.`,
          });
          continue;
        }
        console.warn(`[recovery] run ${run.id} (${run.status}) sürdürülüyor — deneme ${attempts}.`);

        switch (run.status) {
          case 'generating_seo':
            if (run.generatedImageUrl) void selectImageForRun(run.id, run.generatedImageUrl);
            else await updatePipelineRun(run.id, { status: 'error', errorMessage: 'Kurtarma: seçili görsel yok.' });
            break;
          case 'processing_files':
            if (run.seo) void approveSeoAndProcess(run.id, run.seo);
            else await updatePipelineRun(run.id, { status: 'error', errorMessage: 'Kurtarma: SEO yok.' });
            break;
          case 'publishing_etsy':
            void publishToEtsy(run.id); // kalıcı publishProgress checkpoint'inden devam
            break;
          case 'generating_image':
          default:
            // İlk adım — resume için varyasyon sayısı kalıcı değil; kullanıcı yeniden başlatsın.
            await updatePipelineRun(run.id, {
              status: 'error',
              errorMessage: 'Görsel üretimi kesintiye uğradı — lütfen yeniden başlatın.',
            });
            break;
        }
      } catch (e) {
        console.error(`[recovery] run ${run.id} kurtarma hatası:`, e instanceof Error ? e.message : e);
      }
    }
  } finally {
    await releaseAdvisoryLock(LOCK_KEY);
  }
}
