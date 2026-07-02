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
 */
export async function generateImages(
  model: ImageModel,
  prompt: string,
  count = 1,
): Promise<GeneratedImage[]> {
  switch (model) {
    case 'flux':
      return generateImagesFlux(prompt, count, '3:4');
    case 'imagen':
      return generateImagesImagen(prompt, count, '3:4');
    default:
      throw new Error(`Bilinmeyen görsel modeli: ${model}`);
  }
}
