/**
 * Paylaşılan fal.ai istemci yardımcıları (flux üretim, clarity-upscaler, kontext mockup).
 * - getFal(): FAL_KEY ile bir kez yapılandırılmış fal client'ını döner.
 * - hasFal(): FAL_KEY tanımlı mı (üretim adımlarını koşullamak için).
 * - falSubscribe(): zaman aşımına bağlı `fal.subscribe` — ASILI KALMAYI önler (bkz. lib/async/timeout).
 * - uploadBuffer(): bir buffer'ı fal storage'a yükleyip image_url döndürür
 *   (image-to-image modelleri image_url'i fal sunucusundan çeker; lokal URL'ler çalışmaz).
 * Yalnızca server-side import edilir.
 */

import { fal } from '@fal-ai/client';
import { getEnv } from '@/lib/env';
import { TIMEOUTS, TimeoutError, fetchWithTimeout, withTimeout } from '@/lib/async/timeout';

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

/**
 * `fal.subscribe` + zaman aşımı. fal kuyruğu bir işi bıraktığında (gözlemlendi) SDK sonsuza kadar
 * poll ettiği için pipeline adımı asılı kalıyordu; artık bütçe dolunca TimeoutError ile düşer.
 *
 * MALİYET: zaman aşımında yalnız beklemeyi bırakmak yetmez — iş fal'da sürer ve FATURALANIR,
 * kullanıcı da aynı işi yeniden tetikler (çift ödeme). Bu yüzden `onEnqueue` ile alınan istek
 * kimliği üzerinden iş iptal edilir (en iyi çaba). Kuyrukta bekleyen iş iptal olur; çalışmaya
 * başlamış iş fal tarafında iptal edilemeyebilir.
 */
export async function falSubscribe<T = Record<string, unknown>>(
  model: string,
  input: Record<string, unknown>,
  ms: number,
  label: string,
): Promise<T> {
  const client = getFal();
  let requestId: string | undefined;
  try {
    const result = await withTimeout(
      client.subscribe(model, { input, onEnqueue: (id) => (requestId = id) }),
      ms,
      label,
    );
    return result.data as T;
  } catch (err) {
    if (err instanceof TimeoutError && requestId) {
      try {
        await withTimeout(client.queue.cancel(model, { requestId }), 15_000, `fal iptal (${label})`);
        console.warn(`[fal] ${label} zaman aşımı — iş iptal edildi (${requestId}).`);
      } catch (e) {
        console.warn(`[fal] ${label} zaman aşımı — iptal edilemedi (${requestId}):`, e instanceof Error ? e.message : e);
      }
    }
    throw err;
  }
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
  return withTimeout(client.storage.upload(file), TIMEOUTS.transfer, `fal storage yüklemesi (${filename})`);
}

/** fal CDN URL'inden buffer indirir. */
export async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetchWithTimeout(url, {}, TIMEOUTS.transfer, 'fal görsel indirme');
  if (!res.ok) throw new Error(`fal görseli indirilemedi (${res.status}): ${url}`);
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') ?? 'image/png',
  };
}
