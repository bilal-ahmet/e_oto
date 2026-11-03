/**
 * Teslim dosyalarının doğrulaması — açıklamadaki vaat (adet, piksel, oran) ile gerçekten
 * üretilen dosya AYNI olmalı.
 *
 * NEDEN: Mağazadaki eski ilanlarda dosya adı "5x7" olup içeriği 4:5 olan (aynı SHA-256) dosyalar
 * ve açıklamada yazandan farklı adette dosya bulundu. Dosya ADINA ya da DPI meta verisine
 * güvenilmez: piksel boyutu başlıktan okunur, oran pikselden hesaplanır, içerik hash'lenir.
 *
 * Bellek: `sharp(buffer).metadata()` yalnız başlığı okur (görüntü açılmaz) — 77 MP dosyada da
 * ucuzdur; paketleme sözleşmesini (bkz. resize-and-export başlığı) bozmaz.
 */

import { createHash } from 'crypto';
import { sharp } from '@/lib/image/sharp';
import { AppError } from '@/lib/errors';
import type { DigitalFileSpec } from '@/lib/product/config';

/** Etsy dijital dosya başına üst sınır. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** 7500×10500 → "5:7" (gerçek piksel oranı; dosya adından değil). */
export function pixelRatio(w: number, h: number): string {
  const g = gcd(w, h) || 1;
  return `${w / g}:${h / g}`;
}

/**
 * Paketleme sırasında her dosyayı üretildiği anda doğrular (sıralı; buffer'lar biriktirilmez,
 * yalnız hash'ler tutulur). İhlalde `AppError('validation')` — hangi dosya, hangi alan.
 */
export class PackageValidator {
  private readonly hashes = new Map<string, string>(); // sha256 → dosya adı
  private readonly seen = new Set<string>();

  constructor(private readonly specs: DigitalFileSpec[]) {}

  async check(spec: DigitalFileSpec, buffer: Buffer): Promise<void> {
    const name = spec.fileName;
    const meta = await sharp(buffer).metadata();
    if (meta.format !== 'jpeg') {
      throw new AppError('validation', `Dosya doğrulaması: ${name} JPEG değil (${meta.format ?? 'bilinmiyor'}).`);
    }
    if (meta.width !== spec.width || meta.height !== spec.height) {
      throw new AppError(
        'validation',
        `Dosya doğrulaması: ${name} ${meta.width}×${meta.height} px — beklenen ${spec.width}×${spec.height} px ` +
          `(oran ${pixelRatio(meta.width ?? 0, meta.height ?? 0)} ≠ ${pixelRatio(spec.width, spec.height)}).`,
      );
    }
    if (buffer.length > MAX_FILE_BYTES) {
      throw new AppError(
        'validation',
        `Dosya doğrulaması: ${name} ${(buffer.length / 1048576).toFixed(1)} MB — Etsy dosya başına en fazla 20 MB kabul eder.`,
      );
    }
    const h = sha256(buffer);
    const dup = this.hashes.get(h);
    if (dup) {
      throw new AppError('validation', `Dosya doğrulaması: ${name} ile ${dup} birebir aynı içerik (aynı SHA-256).`);
    }
    this.hashes.set(h, name);
    this.seen.add(spec.key);
  }

  /** Tüm dosyalar üretildikten sonra: adet ve anahtar kümesi spec ile aynı mı. */
  assertComplete(): void {
    assertFileKeys(Object.fromEntries([...this.seen].map((k) => [k, k])), this.specs);
  }
}

/** Kayıtlı dosya haritası (digitalFileUrls) spec'teki dosyaların TAMAMINI ve yalnızca onları içeriyor mu. */
export function assertFileKeys(files: Record<string, string>, specs: DigitalFileSpec[]): void {
  const want = specs.map((s) => s.key).sort();
  const have = Object.keys(files).filter((k) => files[k]).sort();
  const missing = want.filter((k) => !have.includes(k));
  const extra = have.filter((k) => !want.includes(k));
  if (missing.length || extra.length) {
    throw new AppError(
      'validation',
      `Dosya doğrulaması: ${have.length}/${want.length} dosya` +
        (missing.length ? ` — eksik: ${missing.join(', ')}` : '') +
        (extra.length ? ` — beklenmeyen: ${extra.join(', ')}` : '') +
        '. Açıklamadaki dosya listesiyle eşleşmiyor.',
    );
  }
}
