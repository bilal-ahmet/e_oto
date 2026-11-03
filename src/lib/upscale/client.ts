/**
 * Upscale istemcisi — fal.ai `clarity-upscaler` (creativity 0.3).
 * Sanat görselini korumak için creativity düşük tutulur. Mockup ve dijital dosyalardan ÖNCE
 * bir kez çalışır; sonucu "master" olur.
 *
 * MALİYET: clarity ÇIKTI megapikseli başına ücretlendirir ($0.03/MP). Büyütme oranı `planUpscale`
 * ile hedef dosya boyutuna ve `UPSCALE_MAX_OUTPUT_MP` tavanına göre seçilir (eskiden her girdi
 * ×4'tü — büyük bir taslak yüklemesi tek upscale'de $3–10 tutabiliyordu).
 *
 * FAL yoksa, plan "atla" diyorsa veya çağrı başarısız olursa PASS-THROUGH'a düşer (girişi aynen
 * döndürür) ki pipeline fal kredisi gelmeden de ilerleyebilsin.
 */

import { sharp } from '@/lib/image/sharp';
import { getEnv } from '@/lib/env';
import { hasFal, falSubscribe, uploadBuffer, downloadImage } from '@/lib/fal';
import { TIMEOUTS } from '@/lib/async/timeout';
import { FAL_PRICES } from '@/lib/cost/prices';
import { planUpscale, type UpscaleTarget } from './plan';
import type { UsageEntry } from '@/types';

export const UPSCALE_MODEL = 'fal-ai/clarity-upscaler';

/**
 * @param targets Ürün tipinin dosya boyutları (`productConfig(...).files`) — gereken büyütmeyi belirler.
 * @returns `fallback` doluysa AI upscale YAPILMADI ve sebebi (run uyarısına yazılır).
 *          `usage` doluysa fal'a ücretli istek gitti (maliyet kaydı).
 */
export async function upscale(
  buffer: Buffer,
  targets: UpscaleTarget[],
): Promise<{ buffer: Buffer; fallback?: string; usage?: UsageEntry }> {
  if (!hasFal()) {
    console.warn('[upscale] FAL_KEY yok — pass-through (ham görsel master kabul edildi).');
    return { buffer, fallback: 'FAL_KEY tanımlı değil' };
  }

  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) return { buffer, fallback: 'girdi görselinin boyutu okunamadı' };
  const plan = planUpscale(meta.width, meta.height, targets, getEnv().UPSCALE_MAX_OUTPUT_MP);
  if (plan.factor === 0) {
    return { buffer, fallback: `AI upscale atlandı — ${plan.skipReason} (maliyet: $0)` };
  }

  const usage: UsageEntry = {
    step: 'upscale',
    model: UPSCALE_MODEL,
    units: Number(plan.outMp.toFixed(2)),
    unit: 'megapixel',
    unitPriceUsd: FAL_PRICES.upscalePerMp,
    at: new Date().toISOString(),
    note: `×${plan.factor}, ${meta.width}×${meta.height} → ${plan.outWidth}×${plan.outHeight}`,
  };
  try {
    const imageUrl = await uploadBuffer(buffer, 'image/png', 'master-source.png');
    const out = await falSubscribe<{ image?: { url?: string }; images?: { url: string }[] }>(
      UPSCALE_MODEL,
      {
        image_url: imageUrl,
        upscale_factor: plan.factor,
        creativity: 0.3, // sanat görselini koru
      },
      TIMEOUTS.upscale,
      'clarity-upscaler',
    );
    const url = out.image?.url ?? out.images?.[0]?.url;
    if (!url) throw new Error('clarity-upscaler görsel döndürmedi.');
    const { buffer: upscaled } = await downloadImage(url);
    return { buffer: upscaled, usage };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[upscale] clarity-upscaler başarısız (${msg}) — pass-through'a düşülüyor.`);
    // İstek fal'a ulaştıysa faturalanmış olabilir — tahmine üst sınır olarak yazılır.
    return {
      buffer,
      fallback: `clarity-upscaler başarısız: ${msg.slice(0, 200)}`,
      usage: { ...usage, note: `${usage.note} — BAŞARISIZ (faturalanmış olabilir)` },
    };
  }
}
