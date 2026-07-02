/**
 * Paylaşılan fal.ai istemci yardımcıları (flux üretim, clarity-upscaler, kontext mockup).
 * - getFal(): FAL_KEY ile bir kez yapılandırılmış fal client'ını döner.
 * - hasFal(): FAL_KEY tanımlı mı (üretim adımlarını koşullamak için).
 * - uploadBuffer(): bir buffer'ı fal storage'a yükleyip image_url döndürür
 *   (image-to-image modelleri image_url'i fal sunucusundan çeker; lokal URL'ler çalışmaz).
 * Yalnızca server-side import edilir.
 */

import { fal } from '@fal-ai/client';
import { getEnv } from '@/lib/env';

let _configured = false;

export function hasFal(): boolean {
  return Boolean(getEnv().FAL_KEY);
}

export function getFal(): typeof fal {
  if (!_configured) {
    const key = getEnv().FAL_KEY;
    if (!key) throw new Error('FAL_KEY tanımlı değil — fal.ai çağrısı yapılamaz.');
    fal.config({ credentials: key });
    _configured = true;
  }
  return fal;
}

/** Buffer'ı fal storage'a yükler ve erişilebilir bir URL döner. */
export async function uploadBuffer(
  buffer: Buffer,
  contentType = 'image/png',
  filename = 'image.png',
): Promise<string> {
  const client = getFal();
  const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
  const file = new File([blob], filename, { type: contentType });
  return client.storage.upload(file);
}

/** fal CDN URL'inden buffer indirir. */
export async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fal görseli indirilemedi (${res.status}): ${url}`);
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') ?? 'image/png',
  };
}
