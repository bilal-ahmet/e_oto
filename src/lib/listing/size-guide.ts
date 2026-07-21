/**
 * Sabit ölçü (size guide) görseli — kullanıcı tek seferlik koyar, her listing'e aynısı eklenir.
 * Konum: public/templates/size-guide.(png|jpg|jpeg|webp). Yoksa null döner (publish'te atlanır).
 *
 * Ham dosya 7.2 MB PNG olabiliyor; Etsy'ye yüklenen bir listing görseli için bu gereksiz
 * (Etsy zaten kendi boyutlarına indiriyor). Her run'da diskten okuyup Spaces'e ve Etsy'ye
 * 7 MB taşımak yerine bir kez 2000px JPEG'e normalize edilip süreç boyunca cache'lenir.
 */

import { readFile, access } from 'fs/promises';
import path from 'path';
import { sharp } from '@/lib/image/sharp';

const DIR = path.join(process.cwd(), 'public', 'templates');
const CANDIDATES = ['size-guide.png', 'size-guide.jpg', 'size-guide.jpeg', 'size-guide.webp'];

/** Etsy listing görselleri için fazlasıyla yeterli — 2000px uzun kenar. */
const MAX_EDGE = 2000;

export interface SizeGuide {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

// Süreç ömrü boyunca tek sefer hazırlanır (dosya deploy ile gelir, çalışırken değişmez).
let _cached: SizeGuide | null | undefined;

export async function getSizeGuide(): Promise<SizeGuide | null> {
  if (_cached !== undefined) return _cached;

  for (const file of CANDIDATES) {
    const full = path.join(DIR, file);
    try {
      await access(full);
      const raw = await readFile(full);
      const buffer = await sharp(raw)
        .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: false, progressive: false, optimiseCoding: false })
        .toBuffer();
      _cached = { buffer, contentType: 'image/jpeg', ext: 'jpg' };
      return _cached;
    } catch {
      // sonraki adayı dene
    }
  }

  _cached = null;
  return _cached;
}
