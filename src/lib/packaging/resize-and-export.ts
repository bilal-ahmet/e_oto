/**
 * Onaylanan master görseli oran başına TEK JPG'ye export eder (CLAUDE.md §7, §10).
 * Her oran, o oranın EN BÜYÜK boyutuna (PRINT_RATIOS) resize edilir; JPG q90, 300 DPI density.
 * Müşteri açıklamadaki alt boyutları baskıcıda küçülterek alır. 5 oran = 5 JPG.
 * Her JPG <20MB olmalı; aşarsa kalite %5 düşürülerek tekrar denenir (zemin %60).
 */

import sharp from 'sharp';
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
 */
export async function packageJpegs(master: Buffer): Promise<DigitalFile[]> {
  return Promise.all(
    PRINT_RATIOS.map(async (r): Promise<DigitalFile> => {
      let quality = START_QUALITY;
      let buffer: Buffer;
      for (;;) {
        buffer = await sharp(master)
          .resize(r.width, r.height, { fit: 'cover', position: 'centre' })
          .withMetadata({ density: 300 }) // 300 DPI
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
        if (buffer.length <= MAX_BYTES || quality <= MIN_QUALITY) break;
        quality -= 5;
      }
      return { key: r.key, filename: r.fileName, buffer, contentType: 'image/jpeg' };
    }),
  );
}
