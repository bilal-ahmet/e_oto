/**
 * Onaylanan master görseli oran başına TEK JPG'ye export eder (CLAUDE.md §7, §10).
 * Her oran, o oranın EN BÜYÜK boyutuna (PRINT_RATIOS) resize edilir.
 * Müşteri açıklamadaki alt boyutları baskıcıda küçülterek alır. 5 oran = 5 JPG.
 * Kalite/DPI ürün tipinden gelir (`productConfig(...).jpeg`): DPI her tipte 300; baskı q90 4:2:0,
 * Frame TV q97 4:4:4 (dosyalar küçük olduğu için kalite yukarı çekilebiliyor).
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
import type { DigitalFileSpec, JpegExportSettings } from '@/lib/product/config';

export interface DigitalFile {
  key: string; // digitalFileUrls anahtarı (print RatioKey veya tv 'screen_*')
  filename: string; // örn. "ratio-2x3-24x36.jpg" / "frame-tv-4k-3840x2160.jpg"
  buffer: Buffer;
  contentType: 'image/jpeg';
}

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const MIN_QUALITY = 60;

/**
 * Master görseli verilen dosya spec'lerinin boyutlarına resize + JPG export eder.
 * @param master Upscale edilmiş (veya pass-through) master görsel buffer'ı.
 * @param specs Ürün tipine göre dosya spec'leri (print: 5 oran, tv: 4K + Full HD). `productConfig(...).files`.
 * @param jpeg DPI + kalite ayarları (`productConfig(...).jpeg`). DPI her ürün tipinde 300.
 * @param onFile Her dosya üretildiğinde çağrılır (sıralı, await edilir). Burada depoya yazıp
 *               buffer'ı bırakmak beklenir — fonksiyon çıktıları kendi içinde biriktirmez.
 */
export async function packageJpegs(
  master: Buffer,
  specs: DigitalFileSpec[],
  jpeg: JpegExportSettings,
  onFile: (file: DigitalFile) => Promise<void>,
): Promise<void> {
  // Master hedeften küçükse sharp yukarı örnekler → yumuşak/detaysız çıktı. Sessizce olmasın:
  // pratikte upscale adımının pass-through'a düştüğü (FAL_KEY/kredi yok) anlamına gelir.
  const meta = await sharp(master).metadata();
  const short = Math.min(meta.width ?? 0, meta.height ?? 0);
  const needed = Math.max(...specs.map((s) => Math.min(s.width, s.height)));
  if (short && short < needed) {
    console.warn(
      `[packaging] Master ${meta.width}×${meta.height}, en büyük hedef kısa kenarı ${needed}px — ` +
        'dosyalar yukarı örneklenecek (upscale pass-through mı?). Çıktı kalitesi düşük olacak.',
    );
  }

  for (const s of specs) {
    let quality = jpeg.quality;
    let buffer: Buffer;
    for (;;) {
      buffer = await sharp(master)
        .resize(s.width, s.height, { fit: 'cover', position: 'centre' })
        .withMetadata({ density: jpeg.density })
        // Baseline libjpeg — optimiseCoding/progressive tüm-görüntü katsayı tamponu ister (bkz. başlık).
        .jpeg({
          quality,
          chromaSubsampling: jpeg.chromaSubsampling,
          mozjpeg: false,
          progressive: false,
          optimiseCoding: false,
        })
        .toBuffer();
      if (buffer.length <= MAX_BYTES || quality <= MIN_QUALITY) break;
      quality -= 5;
    }
    await onFile({ key: s.key, filename: s.fileName, buffer, contentType: 'image/jpeg' });
  }
}
