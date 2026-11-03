/**
 * Upscale istemcisi — fal.ai `clarity-upscaler` (×4, creativity 0.3).
 * Sanat görselini korumak için creativity düşük tutulur. Mockup ve dijital dosyalardan ÖNCE
 * bir kez çalışır; sonucu "master" olur.
 *
 * FAL yoksa veya çağrı başarısız olursa PASS-THROUGH'a düşer (girişi aynen döndürür) ki
 * pipeline (5 JPG/video) fal kredisi gelmeden de ilerleyebilsin.
 */

import { hasFal, falSubscribe, uploadBuffer, downloadImage } from '@/lib/fal';
import { TIMEOUTS } from '@/lib/async/timeout';

const MODEL = 'fal-ai/clarity-upscaler';

/**
 * @returns `fallback` doluysa upscale YAPILMADI (pass-through) ve sebebi — çağıran bunu run uyarısına
 * yazar; eskiden yalnız sunucu loguna düşüyordu ve dosyaların gerçek detayı bilinmiyordu.
 */
export async function upscale(buffer: Buffer): Promise<{ buffer: Buffer; fallback?: string }> {
  if (!hasFal()) {
    console.warn('[upscale] FAL_KEY yok — pass-through (ham görsel master kabul edildi).');
    return { buffer, fallback: 'FAL_KEY tanımlı değil' };
  }
  try {
    const imageUrl = await uploadBuffer(buffer, 'image/png', 'master-source.png');
    const out = await falSubscribe<{ image?: { url?: string }; images?: { url: string }[] }>(
      MODEL,
      {
        image_url: imageUrl,
        upscale_factor: 4,
        creativity: 0.3, // sanat görselini koru
      },
      TIMEOUTS.upscale,
      'clarity-upscaler',
    );
    const url = out.image?.url ?? out.images?.[0]?.url;
    if (!url) throw new Error('clarity-upscaler görsel döndürmedi.');
    const { buffer: upscaled } = await downloadImage(url);
    return { buffer: upscaled };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[upscale] clarity-upscaler başarısız (${msg}) — pass-through'a düşülüyor.`);
    return { buffer, fallback: `clarity-upscaler başarısız: ${msg.slice(0, 200)}` };
  }
}
