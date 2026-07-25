/**
 * Görsel üretim dispatcher'ı — seçilen modele göre ilgili API'ye yönlendirir.
 * UI'da seçilen `ImageModel` ('imagen' | 'flux') buraya gelir.
 * Yalnızca server-side import edilir.
 */

import type { ImageModel } from '@/types';
import { generateImagesImagen } from '@/lib/imagen/client';
import { generateImagesFlux, type FluxAspectRatio } from '@/lib/flux/client';

/** Imagen'in kabul ettiği oran alt kümesi (FLUX daha geniş; TV/print için ortak olanlar kullanılır). */
type ImagenAspect = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
function toImagenAspect(a: FluxAspectRatio): ImagenAspect {
  const allowed: ImagenAspect[] = ['1:1', '3:4', '4:3', '9:16', '16:9'];
  return (allowed as string[]).includes(a) ? (a as ImagenAspect) : '3:4';
}

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
  aspect: FluxAspectRatio = '3:4',
  referenceUrl?: string,
): Promise<GeneratedImage[]> {
  if (referenceUrl) return generateImagesFlux(prompt, count, aspect, referenceUrl);

  switch (model) {
    case 'flux':
      return generateImagesFlux(prompt, count, aspect);
    case 'imagen':
      return generateImagesImagen(prompt, count, toImagenAspect(aspect));
    default:
      throw new Error(`Bilinmeyen görsel modeli: ${model}`);
  }
}
