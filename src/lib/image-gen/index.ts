/**
 * Görsel üretim dispatcher'ı — seçilen modele göre ilgili API'ye yönlendirir.
 * UI'da seçilen `ImageModel` ('imagen' | 'flux') buraya gelir.
 * Yalnızca server-side import edilir.
 */

import type { ImageModel } from '@/types';
import { generateImagesImagen } from '@/lib/imagen/client';
import { generateImagesFlux } from '@/lib/flux/client';

export interface GeneratedImage {
  buffer: Buffer;
  contentType: string;
}

/**
 * Seçilen modelle `count` adet varyasyon üretir.
 * @param model 'imagen' (Google) | 'flux' (fal.ai FLUX.1 Kontext pro)
 * @param referenceUrl fal storage'a yüklenmiş referans görsel URL'i (opsiyonel).
 *   Verilirse üretim HER ZAMAN FLUX Kontext image-to-image ile yapılır — Imagen 4 görsel
 *   girdisi kabul etmiyor, dolayısıyla referans modunda tek gerçek seçenek FLUX'tır.
 *   Çağıran (lib/pipeline/run) bu düşüşü run'a `imageModel: 'flux'` olarak yazar.
 */
export async function generateImages(
  model: ImageModel,
  prompt: string,
  count = 1,
  referenceUrl?: string,
): Promise<GeneratedImage[]> {
  if (referenceUrl) return generateImagesFlux(prompt, count, '3:4', referenceUrl);

  switch (model) {
    case 'flux':
      return generateImagesFlux(prompt, count, '3:4');
    case 'imagen':
      return generateImagesImagen(prompt, count, '3:4');
    default:
      throw new Error(`Bilinmeyen görsel modeli: ${model}`);
  }
}
