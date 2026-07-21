/**
 * FLUX.1 Kontext [pro] (fal.ai) ile görsel üretimi.
 * Text-to-image endpoint'i kullanılır; num_images ile varyasyon üretilir.
 * Çıktı görselleri fal CDN URL'i olarak döner; buffer'a indirilir.
 * Yalnızca server-side import edilir.
 */

import { downloadImage, falSubscribe } from '@/lib/fal';
import { TIMEOUTS } from '@/lib/async/timeout';

const MODEL = 'fal-ai/flux-pro/kontext/text-to-image';

// FLUX desteklenen oranlar; dikey duvar sanatı için varsayılan 3:4.
export type FluxAspectRatio = '21:9' | '16:9' | '4:3' | '3:2' | '1:1' | '2:3' | '3:4' | '9:16' | '9:21';

interface FluxImage {
  url: string;
  content_type?: string;
}

/**
 * Verilen prompt'tan `count` adet görsel (varyasyon) üretir.
 * @returns Her varyasyon için buffer + MIME tipi.
 */
export async function generateImagesFlux(
  prompt: string,
  count = 1,
  aspectRatio: FluxAspectRatio = '3:4',
): Promise<{ buffer: Buffer; contentType: string }[]> {
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
