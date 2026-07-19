/**
 * Next.js instrumentation hook — server başlangıcında bir kez çalışır (yalnızca Node.js runtime).
 *   1) Zorunlu env değişkenlerini erken doğrular (fail-fast).
 *   2) Pipeline kurtarma cron'unu kaydeder (varsayılan açık; PIPELINE_RECOVERY_ENABLED=false ile kapatılır).
 *   3) COMPETITOR_CRON_ENABLED=true ise rakip tarama cron'unu kaydeder.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // 1) Boot fail-fast — DATABASE_URL / TOKEN_ENCRYPTION_KEY eksik/hatalıysa burada patla (lazy değil).
  //    Üretimde ayrıca Spaces zorunlu (ephemeral disk → veri kaybı) — assertProdEnv kontrol eder.
  const { getEnv, assertProdEnv } = await import('@/lib/env');
  getEnv();
  assertProdEnv();

  // 2) Pipeline kurtarma (askıda kalan run'ları sürdürür).
  if (process.env.PIPELINE_RECOVERY_ENABLED !== 'false') {
    const { registerRecoveryCron } = await import('@/cron/recovery');
    registerRecoveryCron();
  }

  // 3) Rakip tarama (opt-in).
  if (process.env.COMPETITOR_CRON_ENABLED === 'true') {
    const { registerCompetitorScanCron } = await import('@/cron/competitor-scan');
    registerCompetitorScanCron();
  }
}
