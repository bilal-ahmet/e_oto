/**
 * FLUX.1 Kontext [pro] (fal.ai) ile görsel üretimi.
 *
 * İki mod:
 *  - Referans YOKSA → text-to-image endpoint'i; num_images ile varyasyon üretilir.
 *  - Referans VARSA → image-to-image (kontext) endpoint'i; `image_url` ile model referans
 *    görseli GERÇEKTEN görür. Bu modda varyasyonlar tek tek (farklı seed'lerle) üretilir:
 *    tek çağrıda num_images>1 aynı seed'den türediği için çıktılar birbirine çok yakın çıkar.
 *
 * Çıktı görselleri fal CDN URL'i olarak döner; buffer'a indirilir.
 * Yalnızca server-side import edilir.
 */

import { downloadImage, falSubscribe } from '@/lib/fal';
import { TIMEOUTS } from '@/lib/async/timeout';

const MODEL = 'fal-ai/flux-pro/kontext/text-to-image';
const MODEL_I2I = 'fal-ai/flux-pro/kontext';

// FLUX desteklenen oranlar; dikey duvar sanatı için varsayılan 3:4.
export type FluxAspectRatio = '21:9' | '16:9' | '4:3' | '3:2' | '1:1' | '2:3' | '3:4' | '9:16' | '9:21';

interface FluxImage {
  url: string;
  content_type?: string;
}

/**
 * Verilen prompt'tan `count` adet görsel (varyasyon) üretir.
 * @param referenceUrl fal storage'a yüklenmiş referans görsel URL'i. Verilirse image-to-image
 *   modu kullanılır (model görseli girdi olarak alır); verilmezse saf text-to-image.
 * @returns Her varyasyon için buffer + MIME tipi.
 */
export async function generateImagesFlux(
  prompt: string,
  count = 1,
  aspectRatio: FluxAspectRatio = '3:4',
  referenceUrl?: string,
): Promise<{ buffer: Buffer; contentType: string }[]> {
  if (referenceUrl) return generateFromReference(prompt, referenceUrl, count, aspectRatio);

  const data = await falSubscribe<{ images?: FluxImage[] }>(
    MODEL,
    {
      prompt,
      num_images: Math.max(1, Math.min(count, 4)),
      aspect_ratio: aspectRatio,
      output_format: 'png',
    },
    TIMEOUTS.imageGen,
    'FLUX varyasyon üretimi',
  );

  const images = data.images ?? [];
  if (images.length === 0) {
    throw new Error('FLUX görsel döndürmedi (içerik politikası veya boş yanıt olabilir).');
  }

  return Promise.all(
    images.map(async (img) => {
      const { buffer, contentType } = await downloadImage(img.url);
      return { buffer, contentType: img.content_type ?? contentType };
    }),
  );
}

/**
 * Referans görselden `count` varyasyon (image-to-image). Her varyasyon kendi rastgele seed'iyle
 * ayrı bir çağrıda üretilir — mockup üretimindeki desenin aynısı (bkz. lib/mockup/client).
 * Bir varyasyon patlarsa diğerleri korunur; hepsi patlarsa hata fırlatılır.
 */
async function generateFromReference(
  prompt: string,
  referenceUrl: string,
  count: number,
  aspectRatio: FluxAspectRatio,
): Promise<{ buffer: Buffer; contentType: string }[]> {
  const n = Math.max(1, Math.min(count, 4));

  const results = await Promise.allSettled(
    Array.from({ length: n }, async (_, i) => {
      const data = await falSubscribe<{ images?: FluxImage[] }>(
        MODEL_I2I,
        {
          prompt,
          image_url: referenceUrl,
          num_images: 1,
          aspect_ratio: aspectRatio,
          output_format: 'png',
          seed: Math.floor(Math.random() * 2_000_000_000),
        },
        TIMEOUTS.imageGen,
        `FLUX referanslı varyasyon ${i + 1}/${n}`,
      );
      const img = (data.images ?? [])[0];
      if (!img?.url) throw new Error('FLUX görsel döndürmedi (içerik politikası veya boş yanıt olabilir).');
      const { buffer, contentType } = await downloadImage(img.url);
      return { buffer, contentType: img.content_type ?? contentType };
    }),
  );

  const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (ok.length === 0) {
    const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    const reason = first?.reason instanceof Error ? first.reason.message : 'bilinmeyen hata';
    throw new Error(`FLUX referanslı üretim başarısız: ${reason}`);
  }
  return ok;
}
