/**
 * Imagen 4 (Gemini Developer API) ile görsel üretimi.
 * Önizleme kalitesinde PNG buffer döner; onay sonrası packaging upscale/resize eder.
 * Yalnızca server-side import edilir.
 */

import { GoogleGenAI } from '@google/genai';
import { getEnv } from '@/lib/env';

const MODEL = 'imagen-4.0-generate-001';

let _client: GoogleGenAI | undefined;

function client(): GoogleGenAI {
  if (!_client) {
    const apiKey = getEnv().GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_API_KEY tanımlı değil — görsel üretimi yapılamaz.');
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

/**
 * Verilen prompt'tan `count` adet görsel (varyasyon) üretir.
 * @param prompt Zenginleştirilmiş üretim prompt'u (İngilizce önerilir).
 * @param count Üretilecek varyasyon sayısı (Imagen: 1-4).
 * @param aspectRatio Imagen oranı (varsayılan dikey duvar sanatı için '3:4').
 * @returns Her varyasyon için Buffer + MIME tipi.
 */
export async function generateImagesImagen(
  prompt: string,
  count = 1,
  aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' = '3:4',
): Promise<{ buffer: Buffer; contentType: string }[]> {
  const response = await client().models.generateImages({
    model: MODEL,
    prompt,
    config: {
      numberOfImages: Math.max(1, Math.min(count, 4)),
      aspectRatio,
      outputMimeType: 'image/png',
    },
  });

  const images = (response.generatedImages ?? [])
    .map((g) => g.image)
    .filter((img): img is NonNullable<typeof img> => Boolean(img?.imageBytes));

  if (images.length === 0) {
    throw new Error('Imagen görsel döndürmedi (içerik politikası veya boş yanıt olabilir).');
  }

  return images.map((image) => ({
    buffer: Buffer.from(image.imageBytes as string, 'base64'),
    contentType: image.mimeType ?? 'image/png',
  }));
}
