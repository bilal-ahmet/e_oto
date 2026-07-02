/**
 * Next.js instrumentation hook — server başlangıcında bir kez çalışır.
 * Yalnızca Node.js runtime'da (edge/build değil) ve COMPETITOR_CRON_ENABLED=true ise
 * rakip tarama cron'unu kaydeder.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.COMPETITOR_CRON_ENABLED !== 'true') return;

  const { registerCompetitorScanCron } = await import('@/cron/competitor-scan');
  registerCompetitorScanCron();
}
