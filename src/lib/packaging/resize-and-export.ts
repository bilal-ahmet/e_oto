/**
 * Onaylanan master görseli oran başına TEK JPG'ye export eder (CLAUDE.md §7, §10).
 * Her oran, o oranın EN BÜYÜK boyutuna (PRINT_RATIOS) resize edilir; JPG q90, 300 DPI density.
 * Müşteri açıklamadaki alt boyutları baskıcıda küçülterek alır. 5 oran = 5 JPG.
 * Her JPG <20MB olmalı; aşarsa kalite %5 düşürülerek tekrar denenir (zemin %60).
 *
 * BELLEK/CPU SÖZLEŞMESİ (canlıdaki 504/OOM'un kök nedeni buydu — ölçümlerle):
 *  - Oranlar SIRAYLA işlenir. Eski `Promise.all` hali 5 × ~77 megapiksellik pipeline'ı aynı anda
 *    açıyordu: tepe RSS 1823 MB (instance limiti 1 GB) → konteyner OOM ile öldürülüyordu.
 *  - mozjpeg KULLANILMAZ: tüm görüntünün katsayı tablosunu bellekte tutar. Ölçüm (7200×10800):
 *    mozjpeg 6.0 MB / 12.5 s / 611 MB RSS  ↔  baseline 7.1 MB / 5.1 s / 173 MB RSS.
 *    20 MB tavanının çok altında kaldığımız için %15 dosya büyümesi, 3.5× bellek tasarrufuna değer.
 *  - Üretilen buffer'lar biriktirilmez; `onFile` ile üretildiği anda dışarı verilir (depoya yazılıp
 *    serbest bırakılabilsin diye). Aynı anda bellekte tek bir çıktı bulunur.
 */

import { sharp } from '@/lib/image/sharp';
import { PRINT_RATIOS, type RatioKey } from '@/types';

export interface DigitalFile {
  key: RatioKey;
  filename: string; // örn. "ratio-2x3-24x36.jpg"
  buffer: Buffer;
  contentType: 'image/jpeg';
}

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const START_QUALITY = 90;
const MIN_QUALITY = 60;

/**
 * Master görseli 5 oranın en büyük boyutuna resize + JPG (300 DPI) export eder.
 * @param master Upscale edilmiş (veya pass-through) master görsel buffer'ı.
 * @param onFile Her dosya üretildiğinde çağrılır (sıralı, await edilir). Burada depoya yazıp
 *               buffer'ı bırakmak beklenir — fonksiyon çıktıları kendi içinde biriktirmez.
 */
export async function packageJpegs(
  master: Buffer,
  onFile: (file: DigitalFile) => Promise<void>,
): Promise<void> {
  for (const r of PRINT_RATIOS) {
    let quality = START_QUALITY;
    let buffer: Buffer;
    for (;;) {
      buffer = await sharp(master)
        .resize(r.width, r.height, { fit: 'cover', position: 'centre' })
        .withMetadata({ density: 300 }) // 300 DPI
        // Baseline libjpeg — optimiseCoding/progressive tüm-görüntü katsayı tamponu ister (bkz. başlık).
        .jpeg({ quality, mozjpeg: false, progressive: false, optimiseCoding: false })
        .toBuffer();
      if (buffer.length <= MAX_BYTES || quality <= MIN_QUALITY) break;
      quality -= 5;
    }
    await onFile({ key: r.key, filename: r.fileName, buffer, contentType: 'image/jpeg' });
  }
}
