/**
 * Mockup üretimi — fal.ai FLUX.1 Kontext [pro] (image-to-image).
 * Master görsel fal storage'a yüklenip her sahne prompt'uyla çerçeveli duvar mockup'ına dönüştürülür.
 * Yalnızca server-side import edilir.
 */

import { falSubscribe, uploadBuffer, downloadImage } from '@/lib/fal';
import { TIMEOUTS } from '@/lib/async/timeout';
import { MOCKUP_SCENES, type MockupScene } from './scenes';

const MODEL = 'fal-ai/flux-pro/kontext';

interface KontextImage {
  url: string;
  content_type?: string;
}

/**
 * Tek bir sahne mockup'ı üretir. masterUrl = fal storage'a yüklenmiş master görsel URL'i.
 * @param seed Opsiyonel; farklı çıktı için rastgele verilir (yeniden üretimde çeşitlilik sağlar).
 */
export async function generateMockup(
  masterUrl: string,
  scene: MockupScene,
  seed?: number,
): Promise<{ buffer: Buffer; contentType: string }> {
  const data = await falSubscribe<{ images?: KontextImage[] }>(
    MODEL,
    {
      image_url: masterUrl,
      prompt: scene.prompt,
      num_images: 1,
      aspect_ratio: scene.aspectRatio,
      output_format: 'jpeg',
      seed: seed ?? Math.floor(Math.random() * 2_000_000_000),
    },
    TIMEOUTS.mockup,
    `mockup (${scene.key})`,
  );
  const img = (data.images ?? [])[0];
  if (!img?.url) throw new Error(`Mockup üretilemedi (sahne: ${scene.key}).`);
  return downloadImage(img.url);
}

export interface MockupResult {
  key: string;
  index: number;
  ok: boolean;
  buffer?: Buffer;
  contentType?: string;
  error?: string;
}

/**
 * 8 sahnenin tamamını üretir. Master bir kez fal storage'a yüklenir, tüm sahnelerde kullanılır.
 * Hatalı sahneler atlanır (ok=false) — biri patlarsa diğerleri devam eder.
 */
export async function generateAllMockups(master: Buffer): Promise<MockupResult[]> {
  const masterUrl = await uploadBuffer(master, 'image/png', 'mockup-source.png');
  return Promise.all(
    MOCKUP_SCENES.map(async (scene, index): Promise<MockupResult> => {
      try {
        const { buffer, contentType } = await generateMockup(masterUrl, scene);
        return { key: scene.key, index, ok: true, buffer, contentType };
      } catch (err) {
        return { key: scene.key, index, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
}
