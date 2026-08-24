/**
 * İstek gövdesi okuma + boyut sınırı.
 *
 * NEDEN: App Router route handler'larında gövde boyutu VARSAYILAN OLARAK SINIRSIZDIR (Pages
 * API'sindeki 1 MB limiti burada yok). Görsel alan uçlar base64'ü doğrudan Buffer'a çeviriyordu;
 * yeterince büyük tek bir istek 2 GB'lık instance'ı düşürmeye yeter.
 *
 * İki katmanlı koruma:
 *   1) `readJsonBody` — gövdeyi AKITARAK okur ve tavanı aşınca okumayı bırakır (tüm gövdeyi
 *      belleğe almadan). Content-Length varsa daha da erken, tek karşılaştırmayla reddeder.
 *   2) `decodeBase64Limited` — base64 çözülmüş GERÇEK byte boyutunu çözmeden önce hesaplar;
 *      tavanı aşıyorsa Buffer hiç ayrılmaz.
 */

/** Kullanıcıdan gelen tek bir görselin çözülmüş üst sınırı. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * JSON gövde üst sınırı. Base64 veriyi ~4/3 oranında şişirir; 25 MB'lık bir görsel ~33.4 MB
 * base64 eder. Alan (prompt, mediaType, not) payı ile birlikte 34 MB.
 */
export const MAX_BODY_BYTES = 34 * 1024 * 1024;

/** Gövde/dosya çok büyük — çağıran bunu HTTP 413'e çevirir. */
export class PayloadTooLargeError extends Error {
  constructor(limitBytes: number) {
    super(`Gönderilen veri çok büyük — en fazla ${Math.round(limitBytes / (1024 * 1024))} MB.`);
    this.name = 'PayloadTooLargeError';
  }
}

/** Gövde JSON olarak ayrıştırılamadı. */
export class InvalidJsonError extends Error {
  constructor() {
    super('Geçersiz JSON gövde.');
    this.name = 'InvalidJsonError';
  }
}

/**
 * İstek gövdesini en fazla `limit` byte okuyup JSON olarak ayrıştırır.
 * Tavan aşılırsa `PayloadTooLargeError`, ayrıştırılamazsa `InvalidJsonError` atar.
 */
export async function readJsonBody<T>(req: Request, limit = MAX_BODY_BYTES): Promise<T> {
  // Hızlı yol: Content-Length varsa gövdeyi hiç okumadan reddet.
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new PayloadTooLargeError(limit);

  if (!req.body) throw new InvalidJsonError();

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      // Content-Length yalan söylemiş ya da hiç verilmemiş olabilir (chunked) — asıl koruma burası.
      if (total > limit) throw new PayloadTooLargeError(limit);
      chunks.push(value);
    }
  } finally {
    // Erken çıkışta bağlantıyı serbest bırak; aksi halde soket tavanı dolana kadar akmaya devam eder.
    reader.cancel().catch(() => {});
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
  } catch {
    throw new InvalidJsonError();
  }
}

/**
 * base64 metnini, çözülmüş boyutu `limit`i aşmıyorsa Buffer'a çevirir.
 * Boyut ÖNCE hesaplanır; aşan girdide bellek hiç ayrılmaz.
 */
export function decodeBase64Limited(base64: string, limit = MAX_UPLOAD_BYTES): Buffer {
  // data URL öneki gelirse ("data:image/png;base64,...") ayıkla.
  const raw = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const padding = raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0;
  const approxBytes = Math.floor((raw.length * 3) / 4) - padding;
  if (approxBytes > limit) throw new PayloadTooLargeError(limit);
  return Buffer.from(raw, 'base64');
}

/** Yakalanan hatayı uygun HTTP durum koduna çevirir (bilinmiyorsa null). */
export function bodyErrorStatus(e: unknown): number | null {
  if (e instanceof PayloadTooLargeError) return 413;
  if (e instanceof InvalidJsonError) return 400;
  return null;
}
